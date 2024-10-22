import type {
  BlockchainsName,
  Transaction,
  Transfer,
  Wallet,
  WalletCoin,
  WalletsProvider,
} from "@repo/domain";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  type ConfirmedSignatureInfo,
  Connection,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { type } from "arktype";

const tokenAccountType = type({
  info: {
    mint: "string",
    tokenAmount: {
      amount: "string",
      "+": "delete",
    },
    "+": "delete",
  },
  "+": "delete",
});

export interface RpcEndpoint {
  url: string;
  weight: number;
}

interface WeightedConnection {
  connection: Connection;
  weight: number;
}

export class SolanaProvider implements WalletsProvider {
  private readonly connections: WeightedConnection[];

  constructor(rpc_endpoints: RpcEndpoint[]) {
    const totalWeight = rpc_endpoints.reduce(
      (sum, endpoint) => sum + endpoint.weight,
      0,
    );
    if (totalWeight !== 100) throw new Error("Weight sum must be 100");

    this.connections = rpc_endpoints.map((endpoint) => ({
      connection: new Connection(endpoint.url),
      weight: endpoint.weight,
    }));
  }

  private getConnection(): Connection {
    const randomWeight = Math.random() * 100;

    let cumulativeWeight = 0;

    for (const wc of this.connections) {
      cumulativeWeight += wc.weight;
      if (randomWeight < cumulativeWeight) {
        return wc.connection;
      }
    }

    // Fallback in case of rounding errors
    return this.connections[this.connections.length - 1]!.connection;
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet | null> {
    const public_key = new PublicKey(address);

    const account_info = await this.getConnection().getAccountInfo(public_key);

    // Si no es del tipo cuenta normal, no la añado
    if (!account_info || !account_info.owner.equals(SystemProgram.programId))
      return null;

    const token_accounts =
      await this.getConnection().getParsedTokenAccountsByOwner(public_key, {
        programId: TOKEN_PROGRAM_ID,
      });

    // Añado las coins
    const coins: WalletCoin[] = [];
    for (const ta of token_accounts.value) {
      const parsed_data = tokenAccountType(ta.account.data.parsed);
      if (parsed_data instanceof type.errors) continue;
      if (parsed_data.info.tokenAmount.amount === "0") continue;
      coins.push({
        coin_address: parsed_data.info.mint,
        value: BigInt(parsed_data.info.tokenAmount.amount),
      });
    }

    const wallet: Wallet = {
      address,
      blockchain,
      // Por ahora no buscamos domains en Bonfida
      alias: null,
      backfill_status: "pending",
      first_transfer_date: null,
      native_value: BigInt(account_info.lamports),
      coins,
    };

    return wallet;
  }

  async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
    const public_key = new PublicKey(wallet_data.address);

    // Agarro las primeras 5 por temas de velocidad
    const transactions = await this.getConnection().getSignaturesForAddress(
      public_key,
      {
        limit: 5,
      },
    );

    return this.mapTransactionData(transactions);
  }

  async getWalletTimes(
    wallet_data: Wallet,
  ): Promise<{ first_block: number; last_block: number; first_date: Date }> {
    const public_key = new PublicKey(wallet_data.address);
    let loop_cursor: string | undefined = undefined;
    let is_first_time = true;

    let first_block = 0;
    let last_block = 0;
    let first_date = new Date();

    do {
      const transactions = await this.getConnection().getSignaturesForAddress(
        public_key,
        {
          before: loop_cursor,
          limit: 1000,
        },
      );
      if (transactions.length === 0) break;
      if (is_first_time) {
        first_block = transactions[0].slot;
        first_date = new Date(transactions[0].blockTime! * 1000);
        is_first_time = false;
      }

      last_block = transactions[transactions.length - 1].slot;
      if (transactions.length < 1000) break;

      loop_cursor = transactions[transactions.length - 1].signature;
    } while (loop_cursor);

    return { first_block, last_block, first_date };
  }

  async getTransactionHistory(
    address: string,
    _blockchain: BlockchainsName,
    _from_block: number,
    _to_block: number,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    const public_key = new PublicKey(address);

    const transactions = await this.getConnection().getSignaturesForAddress(
      public_key,
      {
        before: loop_cursor,
        limit: 1000,
      },
    );

    if (transactions.length === 0)
      return { transactions: [], cursor: undefined };

    // Como es ineficiente dada la implementación actual del RPC de Solana
    // Voy a ignorar las fechas
    return {
      transactions: await this.mapTransactionData(transactions),
      cursor: transactions[transactions.length - 1].signature,
    };
  }

  async getAllTransactionsFromDate(
    wallet_data: Wallet,
    from_date: Date,
  ): Promise<Transaction[]> {
    const public_key = new PublicKey(wallet_data.address);

    const transactions: Transaction[] = [];

    while (true) {
      const transactions_data =
        await this.getConnection().getSignaturesForAddress(public_key, {
          limit: 1000,
        });

      // Quiero solo las que esten despues de cierta fecha
      const mapped_transactions = await this.mapTransactionData(
        transactions_data.filter(
          (t) => new Date(t.blockTime! * 1000) > from_date,
        ),
      );

      transactions.push(...mapped_transactions);

      // Si despues del filtrado siguen siendo 1000 transacciones, entonces tengo que buscar mas atrás
      if (mapped_transactions.length < 1000) break;
    }

    return transactions;
  }

  async mapTransactionData(
    confirmed_signature_info: ConfirmedSignatureInfo[],
  ): Promise<Transaction[]> {
    const mapped_transactions: Transaction[] = [];

    for (const tx of confirmed_signature_info) {
      if (tx.confirmationStatus !== "finalized") continue;

      const transfers: Transfer[] = [];

      const details = await this.getConnection().getTransaction(tx.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (details?.meta) {
        // Combine pre and post balances into maps for quick lookup
        const preBalancesMap = new Map<string, number>();
        const postBalancesMap = new Map<string, number>();

        const account_ids = [...details.transaction.message.staticAccountKeys];
        if (details.meta.loadedAddresses) {
          account_ids.push(
            ...details.meta.loadedAddresses.writable,
            ...details.meta.loadedAddresses.readonly,
          );
        }

        for (let i = 0; i < account_ids.length; i++) {
          preBalancesMap.set(
            account_ids[i]!.toString(),
            details.meta.preBalances[i] ?? 0,
          );
          postBalancesMap.set(
            account_ids[i]!.toString(),
            details.meta.postBalances[i] ?? 0,
          );
        }

        // Calculate native balance changes
        for (const [account, preBalance] of preBalancesMap.entries()) {
          const postBalance = postBalancesMap.get(account) ?? 0;
          const difference = postBalance - preBalance;
          if (difference !== 0) {
            transfers.push({
              from_address: difference < 0 ? account : null,
              to_address: difference > 0 ? account : null,
              value: BigInt(Math.abs(difference)),
              type: "native",
              coin_address: null,
              token_id: null,
            });
          }
        }

        // Combine pre and post token balances into maps for quick lookup
        const preTokenBalancesMap = new Map<
          string,
          { owner: string; amount: number }
        >();
        const postTokenBalancesMap = new Map<
          string,
          { owner: string; amount: number }
        >();

        for (const tokenBalance of details.meta.preTokenBalances ?? []) {
          preTokenBalancesMap.set(
            `${tokenBalance.mint}-${tokenBalance.accountIndex}`,
            {
              owner: tokenBalance.owner!,
              amount: Number(tokenBalance.uiTokenAmount.amount),
            },
          );
        }

        for (const tokenBalance of details.meta.postTokenBalances ?? []) {
          postTokenBalancesMap.set(
            `${tokenBalance.mint}-${tokenBalance.accountIndex}`,
            {
              owner: tokenBalance.owner!,
              amount: Number(tokenBalance.uiTokenAmount.amount),
            },
          );
        }

        // Calculate token balance changes
        const uniqueTokenKeys = new Set([
          ...preTokenBalancesMap.keys(),
          ...postTokenBalancesMap.keys(),
        ]);

        for (const key of uniqueTokenKeys) {
          const preToken = preTokenBalancesMap.get(key);
          const postToken = postTokenBalancesMap.get(key);
          const preBalance = preToken?.amount ?? 0;
          const postBalance = postToken?.amount ?? 0;
          const difference = postBalance - preBalance;

          if (difference !== 0) {
            const owner = preToken?.owner ?? postToken?.owner ?? "";
            const mint = key.split("-")[0]!;
            transfers.push({
              from_address: difference < 0 ? owner : null,
              to_address: difference > 0 ? owner : null,
              value: BigInt(Math.abs(difference)),
              type: "token",
              coin_address: mint,
              token_id: null,
            });
          }
        }
      }

      mapped_transactions.push({
        block_timestamp: new Date(tx.blockTime! * 1000),
        blockchain: "solana",
        fee: 0n,
        hash: tx.signature,
        transfers,
        summary: null,
        from_address: null,
        to_address: null,
      });
    }

    return mapped_transactions;
  }
}
