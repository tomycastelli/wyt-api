import {
  EvmChain,
  type EvmWalletHistoryTransaction,
} from "@moralisweb3/common-evm-utils";
import {
  type BlockchainsName,
  type SavedWallet,
  type Stream,
  type Transaction,
  type Transfer,
  type Wallet,
  type WalletCoin,
  type WalletsStreamsProvider,
  blockchains,
} from "@repo/domain";
import { type } from "arktype";
import Moralis from "moralis";
import { sha3 } from "web3-utils";
import { RateLimiter } from "../ratelimiter.js";

const ethWebhookTransactionType = type({
  confirmed: "boolean",
  chainId: "string",
  block: {
    timestamp: "string",
    "+": "delete",
  },
  txs: type({
    hash: "string",
    receiptGasUsed: "string",
    gasPrice: "string",
    fromAddress: "string",
    toAddress: "string",
    value: "string",
    "+": "delete",
  }).array(),
  "erc20Transfers?": type({
    transactionHash: "string",
    contract: "string",
    from: "string",
    to: "string",
    value: "string",
    possibleSpam: "boolean",
    "+": "delete",
  }).array(),
  "nftTransfers?": type({
    transactionHash: "string",
    contract: "string",
    from: "string",
    to: "string",
    tokenId: "string",
    possibleSpam: "boolean",
    "+": "delete",
  }).array(),
  "+": "delete",
});

export class EthereumProvider implements WalletsStreamsProvider {
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
      maxRetries: 5,
    });
  }

  private rate_limiter: RateLimiter = new RateLimiter(10, 20);

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet | null> {
    // Inicializo la wallet
    const wallet_data: Wallet = {
      address,
      backfill_status: "pending",
      blockchain,
      coins: [],
      first_transfer_date: null,
      alias: null,
      native_value: 0n,
    };

    await this.rate_limiter.acquire();
    // Busco las coins que tiene
    let balances_data =
      await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
        chain: this.blockchain_mapper[blockchain],
        address,
        excludeSpam: true,
        excludeUnverifiedContracts: true,
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
          coin_address: c.tokenAddress!.lowercase,
          value: c.balance.value.toBigInt(),
        }));
      wallet_data.coins.push(...coins);
      if (balances_data.hasNext()) {
        balances_data = await balances_data.next();
      }
    } while (balances_data.hasNext());

    // Busco las nft que tiene
    await this.rate_limiter.acquire();
    let nfts_data = await Moralis.EvmApi.nft.getWalletNFTs({
      chain: this.blockchain_mapper[blockchain],
      address,
      excludeSpam: true,
      mediaItems: false,
      normalizeMetadata: true,
    });

    // Agrego nfts hasta que no haya mas páginas
    do {
      const coins: WalletCoin[] = nfts_data.result
        // NFTs con tokenId mayor a 1e9 no los considero serios
        .filter(
          (c) => !!c.metadata && Number(c.tokenId) < 1e9 && c.tokenAddress,
        )
        .map((c) => ({
          coin_address: c.tokenAddress.lowercase,
          value: 0n,
          token_id: Number(c.tokenId),
        }));
      wallet_data.coins.push(...coins);
      if (nfts_data.hasNext()) {
        nfts_data = await nfts_data.next();
      }
    } while (nfts_data.hasNext());
    // Veo si tiene alias (ens domain en Ethereum)
    await this.rate_limiter.acquire();
    const ens_domain = await Moralis.EvmApi.resolve.resolveAddress({ address });
    if (ens_domain) {
      wallet_data.alias = ens_domain.result.name;
    }

    return wallet_data;
  }

  async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
    await this.rate_limiter.acquire();
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
      wallet_data.address,
      wallet_data.blockchain,
    );
  }

  async getAllTransactionsFromDate(
    wallet_data: Wallet,
    from_date: Date,
  ): Promise<Transaction[]> {
    const transactions: Transaction[] = [];

    let loop_cursor: string | undefined = undefined;

    do {
      await this.rate_limiter.acquire();
      try {
        const new_transactions = await Moralis.EvmApi.wallets.getWalletHistory({
          chain: this.blockchain_mapper[wallet_data.blockchain],
          address: wallet_data.address,
          order: "DESC",
          includeInternalTransactions: false,
          fromDate: from_date,
          cursor: loop_cursor,
          limit: 200,
        });

        if (new_transactions.result.length > 0) {
          transactions.push(
            ...this.transactionsFromWalletHistory(
              new_transactions.result,
              wallet_data.address,
              wallet_data.blockchain,
            ),
          );
        }

        loop_cursor = new_transactions.pagination.cursor;
      } catch (e) {
        console.error("Failed getting the new_transactions from wallet", e);
        console.log("Values used: ", {
          chain: this.blockchain_mapper[wallet_data.blockchain],
          address: wallet_data.address,
          order: "DESC",
          includeInternalTransactions: false,
          fromDate: from_date,
          cursor: loop_cursor,
          limit: 200,
        });
      }
    } while (loop_cursor);

    return transactions;
  }

  async getTransactionCount(saved_wallet: SavedWallet): Promise<number> {
    await this.rate_limiter.acquire();
    const data = await Moralis.EvmApi.wallets.getWalletStats({
      chain: this.blockchain_mapper[saved_wallet.blockchain],
      address: saved_wallet.address,
    });

    return Number(data.result.transactions.total);
  }

  async getWalletTimes(
    wallet_data: Wallet,
  ): Promise<{ first_block: number; last_block: number; first_date: Date }> {
    await this.rate_limiter.acquire();
    const first_transaction_made =
      await Moralis.EvmApi.wallets.getWalletHistory({
        chain: this.blockchain_mapper[wallet_data.blockchain],
        address: wallet_data.address,
        order: "ASC",
        includeInternalTransactions: false,
        limit: 1,
      });

    const last_transaction_made = await Moralis.EvmApi.wallets.getWalletHistory(
      {
        chain: this.blockchain_mapper[wallet_data.blockchain],
        address: wallet_data.address,
        order: "DESC",
        includeInternalTransactions: false,
        limit: 1,
      },
    );

    return {
      first_block: Number(
        first_transaction_made.result[0]!.blockNumber.toString(),
      ),
      first_date: new Date(first_transaction_made.result[0]!.blockTimestamp),
      last_block: Number(
        last_transaction_made.result[0]!.blockNumber.toString(),
      ),
    };
  }

  async getTransactionHistory(
    address: string,
    blockchain: BlockchainsName,
    from_block: number,
    to_block: number,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    await this.rate_limiter.acquire();
    try {
      const transaction_history = await Moralis.EvmApi.wallets.getWalletHistory(
        {
          chain: this.blockchain_mapper[blockchain],
          address,
          order: "DESC",
          includeInternalTransactions: false,
          fromBlock: from_block,
          toBlock: to_block,
          cursor: loop_cursor,
          // Paginamos menos para evitar errores de respuesta muy larga
          limit: 200,
        },
      );

      return {
        transactions: this.transactionsFromWalletHistory(
          transaction_history.result,
          address,
          blockchain,
        ),
        cursor: transaction_history.pagination.cursor,
      };
    } catch (e) {
      console.error("Failed getting wallet tx history: ", e);
      console.log({
        values_used: {
          chain: this.blockchain_mapper[blockchain],
          address,
          order: "DESC",
          includeInternalTransactions: false,
          fromBlock: from_block,
          toBlock: to_block,
          cursor: loop_cursor,
          // Paginamos menos para evitar errores de respuesta muy larga
          limit: 200,
        },
      });
      return { transactions: [], cursor: undefined };
    }
  }

  async createStreams(
    webhook_url: string,
    description: string,
    tag: string,
    blockchain: BlockchainsName,
  ): Promise<Stream[]> {
    const NFT_transfer_ABI = [
      {
        anonymous: false,
        inputs: [
          { indexed: true, name: "from", type: "address" },
          { indexed: true, name: "to", type: "address" },
          { indexed: true, name: "tokenId", type: "uint256" },
        ],
        name: "Transfer",
        type: "event",
      },
    ];

    const ERC20_Transfer_ABI = [
      {
        anonymous: false,
        inputs: [
          {
            indexed: true,
            name: "from",
            type: "address",
          },
          {
            indexed: true,
            name: "to",
            type: "address",
          },
          {
            indexed: false,
            name: "value",
            type: "uint256",
          },
        ],
        name: "Transfer",
        type: "event",
      },
    ];

    const nftStream = await Moralis.Streams.add({
      webhookUrl: webhook_url,
      description,
      tag: `nft-${tag}`,
      chains: [this.blockchain_mapper[blockchain]],
      includeAllTxLogs: false,
      includeContractLogs: false,
      allAddresses: false,
      topic0: ["Transfer(address,address,uint256)"],
      advancedOptions: [
        {
          topic0: "Transfer(address,address,uint256)",
          filter: { eq: ["moralis_streams_possibleSpam", "false"] },
        },
      ],
      abi: NFT_transfer_ABI,
    });

    // Probaré con añadir native txs solo a este, como me dijo soporte
    const erc20Stream = await Moralis.Streams.add({
      webhookUrl: webhook_url,
      description,
      tag: `erc20-${tag}`,
      chains: [this.blockchain_mapper[blockchain]],
      includeAllTxLogs: false,
      includeContractLogs: false,
      includeNativeTxs: true,
      allAddresses: false,
      topic0: ["Transfer(address,address,uint256)"],
      abi: ERC20_Transfer_ABI,
      advancedOptions: [
        {
          topic0: "Transfer(address,address,uint256)",
          filter: { eq: ["moralis_streams_possibleSpam", "false"] },
        },
      ],
    });

    return [
      {
        description: nftStream.result.description,
        id: nftStream.result.id,
        tag: nftStream.result.tag,
        webhook_url: nftStream.result.webhookUrl,
        blockchain,
      },
      {
        description: erc20Stream.result.description,
        id: erc20Stream.result.id,
        tag: erc20Stream.result.tag,
        webhook_url: erc20Stream.result.webhookUrl,
        blockchain,
      },
    ];
  }

  async addAddressToStreams(
    stream_ids: string[],
    address: string,
  ): Promise<void> {
    for (const stream_id of stream_ids) {
      await Moralis.Streams.addAddress({
        id: stream_id,
        address,
      });
    }
  }

  async getAllStreams(): Promise<Stream[]> {
    const streams = await Moralis.Streams.getAll({
      limit: 100,
    });

    const mapped_streams: Stream[] = streams.result.map((s) => ({
      id: s.id,
      description: s.description,
      tag: s.tag,
      webhook_url: s.webhookUrl,
      blockchain: this.getBlockchainName(s.chains[0]!)!,
    }));

    return mapped_streams;
  }

  async getAddresesByStream(stream_id: string): Promise<string[]> {
    const stream = await Moralis.Streams.getAddresses({
      id: stream_id,
    });

    return stream.result.map((a) => a.address!.lowercase);
  }

  validateWebhookTransaction(
    body: any,
    secret_key: string,
    headers: Record<string, string>,
  ): boolean {
    const provided_signature = headers["x-signature"];
    if (!provided_signature) throw new Error("Signature not provided");

    const generated_signature = sha3(JSON.stringify(body) + secret_key);
    if (generated_signature !== provided_signature) return false;

    return true;
  }

  parseWebhookTransaction(
    body: any,
    blockchain: BlockchainsName,
  ): Transaction[] | undefined {
    const parsed_webhook_transaction = ethWebhookTransactionType(body);

    if (parsed_webhook_transaction instanceof type.errors)
      throw parsed_webhook_transaction;

    // Solo me interesan las confirmadas
    if (!parsed_webhook_transaction.confirmed) return undefined;

    // Ahora lo mapeo a una transaction que entienda mi dominio
    const mapped_transactions: Transaction[] =
      parsed_webhook_transaction.txs.map((transaction) => {
        const transfers: Transfer[] = [];

        // Si el valor es distinto a 0 es porque hay native transfer
        if (transaction.value !== "0") {
          transfers.push({
            type: "native",
            from_address: transaction.fromAddress,
            to_address: transaction.toAddress,
            value: BigInt(transaction.value),
            coin_address: null,
            token_id: null,
          });
        }

        if (parsed_webhook_transaction.erc20Transfers) {
          for (const erc20Transfer of parsed_webhook_transaction.erc20Transfers.filter(
            (e) => e.possibleSpam === false,
          )) {
            // Si pertence a esta transacción
            if (erc20Transfer.transactionHash === transaction.hash) {
              transfers.push({
                type: "token",
                coin_address: erc20Transfer.contract,
                from_address: erc20Transfer.from,
                to_address: erc20Transfer.to,
                value: BigInt(erc20Transfer.value),
                token_id: null,
              });
            }
          }
        }

        if (parsed_webhook_transaction.nftTransfers) {
          for (const nftTransfer of parsed_webhook_transaction.nftTransfers.filter(
            (e) => e.possibleSpam === false,
          )) {
            if (
              nftTransfer.transactionHash === transaction.hash &&
              Number(nftTransfer.tokenId) < 1e9
            ) {
              transfers.push({
                type: "nft",
                coin_address: nftTransfer.contract,
                from_address: nftTransfer.from,
                to_address: nftTransfer.to,
                value: 0n,
                token_id: Number(nftTransfer.tokenId),
              });
            }
          }
        }

        return {
          block_timestamp: new Date(
            Number(parsed_webhook_transaction.block.timestamp) * 1000,
          ),
          blockchain,
          fee:
            BigInt(transaction.receiptGasUsed) * BigInt(transaction.gasPrice),
          from_address: transaction.fromAddress,
          to_address: transaction.toAddress,
          hash: transaction.hash,
          transfers,
          // No nos da la summary, despues ver como conseguirla
          // Pasa que serian mucho overhead hacer una api call extra por tx entrante
          summary: null,
        };
      });

    return mapped_transactions.filter((tx) => tx.transfers.length > 0);
  }

  async deleteStream(stream_id: string): Promise<void> {
    await Moralis.Streams.delete({
      id: stream_id,
    });
  }

  async getFailedWebhooks(): Promise<
    { body: any; blockchain: BlockchainsName }[]
  > {
    const streams = await this.getAllStreams();
    console.log("Streams available: ", streams);
    const failed_webhooks: { body: any; blockchain: BlockchainsName }[] = [];

    let loop_cursor: string | undefined = undefined;

    do {
      const data = await Moralis.Streams.getHistory({
        limit: 100,
        cursor: loop_cursor,
      });

      loop_cursor = data.pagination.cursor;

      const webhooks_to_insert: { body: any; blockchain: BlockchainsName }[] =
        data.result.map((r) => ({
          blockchain: streams.find((s) => s.id === r.streamId)!.blockchain,
          body: r.payload,
        }));

      failed_webhooks.push(...webhooks_to_insert);
    } while (loop_cursor);

    return failed_webhooks;
  }

  // Helpers

  getBlockchainName(chain: EvmChain): BlockchainsName | undefined {
    for (const [name, evmChain] of Object.entries(this.blockchain_mapper)) {
      if (evmChain.equals(chain)) {
        return name as BlockchainsName;
      }
    }
    return undefined;
  }

  transactionsFromWalletHistory(
    transaction_history_data: EvmWalletHistoryTransaction[],
    address: string,
    blockchain: BlockchainsName,
  ): Transaction[] {
    const transactions_data: Transaction[] = transaction_history_data
      .filter(
        (th) =>
          th.possibleSpam === false &&
          // Es relevante en este caso porque es la que paga la fee
          (th.fromAddress.lowercase === address.toLowerCase() ||
            // Es relevantre en este caso porque sumo o resto alguna coin o nft
            th.erc20Transfers.length > 0 ||
            th.nativeTransfers.length > 0 ||
            th.nftTransfers.length > 0),
      )
      .map((th) => {
        const transfers: Transfer[] = [];

        for (const erc20tx of th.erc20Transfers.filter(
          (erc) => erc.possibleSpam === false,
        )) {
          transfers.push({
            type: "token",
            coin_address: erc20tx.address.lowercase,
            from_address: erc20tx.fromAddress.lowercase,
            to_address: erc20tx.toAddress?.lowercase ?? null,
            value: BigInt(erc20tx.value),
            token_id: null,
          });
        }

        for (const nativeTx of th.nativeTransfers) {
          transfers.push({
            type: "native",
            from_address: nativeTx.fromAddress.lowercase,
            to_address: nativeTx.toAddress?.lowercase ?? null,
            value: BigInt(nativeTx.value),
            token_id: null,
            coin_address: null,
          });
        }

        for (const nftTx of th.nftTransfers.filter(
          (nft) => nft.possibleSpam === false && Number(nft.tokenId) < 1e9,
        )) {
          transfers.push({
            type: "nft",
            from_address: nftTx.fromAddress.lowercase,
            to_address: nftTx.toAddress?.lowercase ?? null,
            value: 0n,
            coin_address: nftTx.tokenAddress.lowercase,
            token_id: Number(nftTx.tokenId),
          });
        }

        const decimal_places = blockchains[blockchain].decimal_places;

        const fee = Number(
          th.transactionFee
            ? th.transactionFee.toString().slice(0, decimal_places)
            : 0,
        );

        return {
          blockchain: blockchain,
          hash: th.hash,
          block_timestamp: new Date(th.blockTimestamp),
          transfers,
          fee: BigInt((fee * 10 ** decimal_places).toFixed(0)),
          from_address: th.fromAddress.lowercase,
          to_address: th.toAddress?.lowercase ?? null,
          summary: th.summary,
        };
      });
    return transactions_data;
  }
}
