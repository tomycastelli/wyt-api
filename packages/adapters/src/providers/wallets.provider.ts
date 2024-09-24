import {
  blockchains,
  BlockchainsName,
  Transaction,
  Transfer,
  Wallet,
  WalletCoin,
  WalletsProvider,
} from "@repo/domain";
import {
  EvmChain,
  EvmWalletHistoryTransaction,
} from "@moralisweb3/common-evm-utils";
import Moralis from "moralis";

/** Esta clase agrupa varios providers de distintas blockchains */
export class WalletsProviderAdapters implements WalletsProvider {
  private ethereumProvider: EthereumProvider;
  // private bitcoinProvider: BitcoinProvider;
  // private solanaProvider: SolanaProvider;

  constructor(
    moralis_api_key: string,
    blockchain_com_api_key: string,
    solana_rpc_endpoint: string,
  ) {
    this.ethereumProvider = new EthereumProvider(moralis_api_key);
    // this.bitcoinProvider = new BitcoinProvider();
    // this.solanaProvider = new SolanaProvider();
  }

  async initialize() {
    await this.ethereumProvider.initialize();
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet> {
    return this.ethereumProvider.getWallet(address, blockchain);
    // const ecosystem = blockchains[blockchain].ecosystem;
    // switch (ecosystem) {
    //   case "ethereum":
    //     return this.ethereumProvider.getWallet(address, blockchain);
    //   case "solana":
    //     return this.bitcoinProvider.getWallet(address, blockchain);
    //   case "bitcoin":
    //     return this.solanaProvider.getWallet(address, blockchain);
    // }
  }

  async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
    return this.ethereumProvider.getRecentTransactions(wallet_data);
  }

  async getTransactionHistory(
    wallet_data: Wallet,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    return this.ethereumProvider.getTransactionHistory(
      wallet_data,
      loop_cursor,
    );
  }
}

class EthereumProvider implements WalletsProvider {
  // Mapeo las Blockchains aceptadas por el Domain a la Chain de Moralis
  private readonly blockchain_mapper: Record<BlockchainsName, EvmChain> = {
    "binance-smart-chain": EvmChain.BSC,
    "polygon-pos": EvmChain.POLYGON,
    avalanche: EvmChain.AVALANCHE,
    ethereum: EvmChain.ETHEREUM,
    // Solo los pongo para satisfacer el type
    bitcoin: EvmChain.BASE_TESTNET,
    solana: EvmChain.BASE_TESTNET,
  };

  private readonly api_key: string;

  constructor(api_key: string) {
    this.api_key = api_key;
  }

  async initialize() {
    await Moralis.start({
      apiKey: this.api_key,
    });
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet> {
    // Inicializo la wallet
    let wallet_data: Wallet = {
      address,
      backfill_status: "pending",
      blockchain,
      coins: [],
      first_transfer_date: null,
      alias: null,
      native_value: 0n,
    };

    // Busco las coins que tiene
    let balances_data =
      await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
        chain: this.blockchain_mapper[blockchain],
        address,
        excludeSpam: true,
      });

    // Agrego el balance de la coin nativa
    wallet_data.native_value = balances_data.result
      .find((c) => c.nativeToken)!
      .balance.value.toBigInt();

    // Agrego coins hasta que no haya mas páginas
    do {
      const coins: WalletCoin[] = balances_data.result
        .filter((c) => !c.nativeToken && c.tokenAddress)
        .map((c) => ({
          coin_address: c.tokenAddress!.checksum,
          value: c.balance.value.toBigInt(),
          type: "coin",
          token_id: null,
        }));
      wallet_data.coins.push(...coins);
      if (balances_data.hasNext()) {
        balances_data = await balances_data.next();
      }
    } while (balances_data.hasNext());

    // Busco las nft que tiene
    let nfts_data = await Moralis.EvmApi.nft.getWalletNFTs({
      chain: this.blockchain_mapper[blockchain],
      address,
      excludeSpam: true,
      mediaItems: false,
    });

    // Agrego nfts hasta que no haya mas páginas
    do {
      const coins: WalletCoin[] = nfts_data.result.map((c) => ({
        coin_address: c.tokenAddress.checksum,
        value: 0n,
        type: "nft",
        token_id: Number(c.tokenId),
      }));
      wallet_data.coins.push(...coins);
      if (nfts_data.hasNext()) {
        nfts_data = await nfts_data.next();
      }
    } while (nfts_data.hasNext());

    // Veo si tiene alias (ens domain en Ethereum)
    const ens_domain = await Moralis.EvmApi.resolve.resolveAddress({ address });
    if (ens_domain) {
      wallet_data.alias = ens_domain.result.name;
    }

    // Busco la primera transacción hecha
    const first_transaction = await Moralis.EvmApi.wallets.getWalletHistory({
      chain: this.blockchain_mapper[blockchain],
      address,
      order: "ASC",
      limit: 1,
      includeInternalTransactions: false,
    });

    if (first_transaction.result[0]) {
      wallet_data.first_transfer_date = new Date(
        first_transaction.result[0].blockTimestamp,
      );
    }

    return wallet_data;
  }

  async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
    const recent_transactions = await Moralis.EvmApi.wallets.getWalletHistory({
      chain: this.blockchain_mapper[wallet_data.blockchain],
      address: wallet_data.address,
      order: "DESC",
      includeInternalTransactions: false,
      // Limito para que sea mas rapido
      limit: 10,
    });

    return this.transactionsFromWalletHistory(
      recent_transactions.result,
      wallet_data,
    );
  }

  async getTransactionHistory(
    wallet_data: Wallet,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    const transaction_history = await Moralis.EvmApi.wallets.getWalletHistory({
      chain: this.blockchain_mapper[wallet_data.blockchain],
      address: wallet_data.address,
      order: "DESC",
      includeInternalTransactions: false,
      cursor: loop_cursor,
    });

    return {
      transactions: this.transactionsFromWalletHistory(
        transaction_history.result,
        wallet_data,
      ),
      cursor: transaction_history.pagination.cursor,
    };
  }

  // Helpers

  transactionsFromWalletHistory(
    transaction_history_data: EvmWalletHistoryTransaction[],
    wallet_data: Wallet,
  ): Transaction[] {
    const transactions_data: Transaction[] = transaction_history_data.map(
      (th) => {
        const transfers: Transfer[] = [];

        for (const erc20tx of th.erc20Transfers) {
          transfers.push({
            type: "erc20",
            coin_address: erc20tx.address.checksum,
            from_address: erc20tx.fromAddress.checksum,
            to_address: erc20tx.toAddress!.checksum,
            value: BigInt(erc20tx.value),
            token_id: null,
          });
        }

        for (const nativeTx of th.nativeTransfers) {
          transfers.push({
            type: "native",
            from_address: nativeTx.fromAddress.checksum,
            to_address: nativeTx.toAddress!.checksum,
            value: BigInt(nativeTx.value),
            token_id: null,
          });
        }

        for (const nftTx of th.nftTransfers) {
          transfers.push({
            type: "nft",
            from_address: nftTx.fromAddress.checksum,
            to_address: nftTx.toAddress!.checksum,
            value: 0n,
            coin_address: nftTx.tokenAddress.checksum,
            token_id: Number(nftTx.tokenId),
          });
        }

        return {
          blockchain: wallet_data.blockchain,
          hash: th.hash,
          block_timestamp: new Date(th.blockTimestamp),
          transfers,
          fee: BigInt(
            Number(th.transactionFee!) *
              10 ** blockchains[wallet_data.blockchain].decimal_places,
          ),
          summary: th.summary,
        };
      },
    );
    return transactions_data;
  }
}

// class BitcoinProvider implements WalletsProvider {}
// class SolanaProvider implements WalletsProvider {}
