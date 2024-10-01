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

export class SolanaProvider implements WalletsProvider {
  private readonly solana: Connection;

  constructor(rpc_endpoint: string) {
    this.solana = new Connection(rpc_endpoint);
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet | null> {
    const public_key = new PublicKey(address);

    const account_info = await this.solana.getAccountInfo(public_key);

    // Si no es del tipo cuenta normal, no la añado
    if (!account_info || !account_info.owner.equals(SystemProgram.programId))
      return null;

    const token_accounts = await this.solana.getParsedTokenAccountsByOwner(
      public_key,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

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

    // Agarro las primeras 20
    const transactions = await this.solana.getSignaturesForAddress(public_key, {
      limit: 20,
    });

    return this.mapTransactionData(
      transactions,
      wallet_data.address,
      wallet_data.blockchain,
    );
  }

  async getTransactionHistory(
    wallet_data: Wallet,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    const public_key = new PublicKey(wallet_data.address);

    // Agarro las primeras 20
    const transactions = await this.solana.getSignaturesForAddress(public_key, {
      before: loop_cursor,
      limit: 1000,
    });

    return {
      transactions: await this.mapTransactionData(
        transactions,
        wallet_data.address,
        wallet_data.blockchain,
      ),
      cursor: transactions[transactions.length - 1]?.signature,
    };
  }

  async getAllTransactionsFromDate(
    wallet_data: Wallet,
    from_date: Date,
  ): Promise<Transaction[]> {
    const public_key = new PublicKey(wallet_data.address);

    const transactions: Transaction[] = [];

    let has_next_page = false;
    do {
      const transactions_data = await this.solana.getSignaturesForAddress(
        public_key,
        {
          limit: 1000,
        },
      );

      // Quiero solo las que esten despues de cierta fecha
      const mapped_transactions = await this.mapTransactionData(
        transactions_data.filter(
          (t) => new Date(t.blockTime! * 1000) > from_date,
        ),
        wallet_data.address,
        wallet_data.blockchain,
      );
      // Si despues del filtrado siguen siendo 1000 transacciones, entonces tengo que buscar mas atrás
      if (mapped_transactions.length === 1000) {
        has_next_page = true;
      } else {
        has_next_page = false;
      }

      transactions.push(...mapped_transactions);
    } while (has_next_page === true);

    return transactions;
  }

  async mapTransactionData(
    confirmed_signature_info: ConfirmedSignatureInfo[],
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Transaction[]> {
    const mapped_transactions: Transaction[] = [];

    for (const tx of confirmed_signature_info) {
      if (tx.confirmationStatus !== "finalized") continue;

      const transfers: Transfer[] = [];

      /// Por lo costoso de hacer esto en la red solana (pueden ser muchas transacciones)
      /// Por ahora no se buscaran detalles

      // const details = await this.solana.getTransaction(tx.signature, {
      //   maxSupportedTransactionVersion: 0,
      // });

      // if (details) {
      //   // Voy a ver diferencias entre pre y post balances y asignar transferencias de acuerdo a eso
      //   const account_ids = details.transaction.message.staticAccountKeys;
      //   if (details.meta?.loadedAddresses) {
      //     account_ids.push(...details.meta.loadedAddresses.writable);
      //     account_ids.push(...details.meta.loadedAddresses.writable);
      //   }

      //   const changed_balances: {
      //     public_key: PublicKey;
      //     difference: number;
      //   }[] = [];

      //   for (let i = 0; i < details.meta!.preBalances.length; i++) {
      //     const difference =
      //       details.meta!.postBalances[i]! - details.meta!.preBalances[i]!;
      //     if (difference !== 0) {
      //       changed_balances.push({ public_key: account_ids[i]!, difference });
      //     }
      //   }

      //   for (const changed_balance of changed_balances) {
      //     // Si es positiva la diferencia, la transferencia va hacia la address, asi que sería to_address
      //     // Si es negativa, lo contrario
      //     transfers.push({
      //       from_address:
      //         changed_balance.difference < 0
      //           ? changed_balance.public_key.toString()
      //           : null,
      //       to_address:
      //         changed_balance.difference > 0
      //           ? changed_balance.public_key.toString()
      //           : null,
      //       value: BigInt(Math.abs(changed_balance.difference)),
      //       type: "native",
      //       coin_address: null,
      //       token_id: null,
      //     });
      //   }

      //   // Hago lo mismo con tokens
      //   if (
      //     details.meta!.preTokenBalances &&
      //     details.meta!.preTokenBalances.length > 0
      //   ) {
      //     const changed_token_balances: {
      //       public_key: PublicKey;
      //       difference: number;
      //       coin_address: string;
      //     }[] = [];

      //     for (let i = 0; i < details.meta!.preTokenBalances.length; i++) {
      //       const difference =
      //         Number(
      //           details.meta!.postTokenBalances![i]!.uiTokenAmount.amount,
      //         ) -
      //         Number(details.meta!.preTokenBalances![i]!.uiTokenAmount.amount);
      //       if (difference !== 0) {
      //         changed_token_balances.push({
      //           public_key: account_ids[i]!,
      //           difference,
      //           coin_address: details.meta!.preTokenBalances[i]!.mint,
      //         });
      //       }
      //     }

      //     for (const changed_token_balance of changed_token_balances) {
      //       // Si es positiva la diferencia, la transferencia va hacia la address, asi que sería to_address
      //       // Si es negativa, lo contrario
      //       transfers.push({
      //         from_address:
      //           changed_token_balance.difference < 0
      //             ? changed_token_balance.public_key.toString()
      //             : null,
      //         to_address:
      //           changed_token_balance.difference > 0
      //             ? changed_token_balance.public_key.toString()
      //             : null,
      //         value: BigInt(Math.abs(changed_token_balance.difference)),
      //         type: "token",
      //         coin_address: changed_token_balance.coin_address,
      //         token_id: null,
      //       });
      //     }
      //   }
      // }

      // Por ahora las transacciones de Solana van a tener que ser vistas en solscan.io usando el hash, o signature
      mapped_transactions.push({
        block_timestamp: new Date(tx.blockTime! * 1000),
        blockchain: blockchain,
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
