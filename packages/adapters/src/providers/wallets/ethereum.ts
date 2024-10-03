import {
	EvmChain,
	type EvmWalletHistoryTransaction,
} from "@moralisweb3/common-evm-utils";
import {
	type BlockchainsName,
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

const ethWebhookTransactionType = type({
	confirmed: "boolean",
	chainId: "string",
	block: {
		timestamp: "string",
		"+": "delete",
	},
	txs: type({
		hash: "string",
		gas: "string",
		gasPrice: "string",
		fromAddress: "string",
		toAddress: "string",
		value: "string",
		"+": "delete",
	}).array(),
	erc20Transfers: type({
		transactionHash: "string",
		contract: "string",
		from: "string",
		to: "string",
		value: "string",
		"+": "delete",
	}).array(),
	nftTransfers: type({
		transactionHash: "string",
		contract: "string",
		from: "string",
		to: "string",
		tokenId: "string",
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
		});
	}

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
					coin_address: c.tokenAddress!.checksum,
					value: c.balance.value.toBigInt(),
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
					coin_address: c.tokenAddress.checksum,
					value: 0n,
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

	async getAllTransactionsFromDate(
		wallet_data: Wallet,
		from_date: Date,
	): Promise<Transaction[]> {
		const transactions: Transaction[] = [];

		let loop_cursor: string | undefined = undefined;

		do {
			const new_transactions = await Moralis.EvmApi.wallets.getWalletHistory({
				chain: this.blockchain_mapper[wallet_data.blockchain],
				address: wallet_data.address,
				order: "DESC",
				includeInternalTransactions: false,
				fromDate: from_date,
			});

			if (new_transactions.result.length > 0) {
				transactions.push(
					...this.transactionsFromWalletHistory(
						new_transactions.result,
						wallet_data,
					),
				);
			}

			loop_cursor = new_transactions.pagination.cursor;
		} while (loop_cursor);

		return transactions;
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
			limit: 300,
		});

		return {
			transactions: this.transactionsFromWalletHistory(
				transaction_history.result,
				wallet_data,
			),
			cursor: transaction_history.pagination.cursor,
		};
	}

	async createStream(
		webhook_url: string,
		description: string,
		tag: string,
		blockchain: BlockchainsName,
	): Promise<Stream> {
		const stream = await Moralis.Streams.add({
			webhookUrl: webhook_url,
			description,
			tag,
			chains: [this.blockchain_mapper[blockchain]],
			includeAllTxLogs: false,
			includeContractLogs: false,
			includeNativeTxs: true,
			allAddresses: false,
			topic0: ["Transfer(address,address,uint256)"],
			advancedOptions: [
				{
					topic0: "Transfer(address,address,uint256)",
					filter: { eq: ["moralis_streams_possibleSpam", "false"] },
				},
			],
			abi: [
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
						{ indexed: true, name: "tokenId", type: "uint256" },
					],
					name: "Transfer",
					type: "event",
				},
			],
		});

		return {
			description: stream.result.description,
			id: stream.result.id,
			tag: stream.result.tag,
			webhook_url: stream.result.webhookUrl,
			blockchain,
		};
	}

	async addAddressToStream(stream_id: string, address: string): Promise<void> {
		await Moralis.Streams.addAddress({
			id: stream_id,
			address,
		});
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

		return stream.result.map((a) => a.address!.checksum);
	}

	validateWebhookTransaction(
		body: any,
		secret_key: string,
		headers: Record<string, string>,
	): boolean {
		const provided_signature = headers["x-signature"];
		if (!provided_signature) throw new Error("Signature not provided");

		const generated_signature = sha3(JSON.stringify(body) + secret_key);
		console.log("Generated signature: ", generated_signature);
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

				for (const erc20Transfer of parsed_webhook_transaction.erc20Transfers) {
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

				for (const nftTransfer of parsed_webhook_transaction.nftTransfers) {
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

				return {
					block_timestamp: new Date(
						Number(parsed_webhook_transaction.block.timestamp) * 1000,
					),
					// Asumo que nunca dara undefined porque no me voy a crear un webhook con una chain que no este dentro de las soportadas
					blockchain,
					fee: BigInt(BigInt(transaction.gas) * BigInt(transaction.gasPrice)),
					from_address: transaction.fromAddress,
					to_address: transaction.toAddress,
					hash: transaction.hash,
					transfers,
					// No nos da la summary, despues ver como conseguirla
					// Pasa que serian mucho overhead hacer una api call extra por tx entrante
					summary: null,
				};
			});

		return mapped_transactions;
	}

	async deleteStream(stream_id: string): Promise<void> {
		await Moralis.Streams.delete({
			id: stream_id,
		});
	}

	// Helpers

	getBlockchainName(chain: EvmChain): BlockchainsName | undefined {
		for (const [name, evmChain] of Object.entries(this.blockchain_mapper)) {
			if (evmChain === chain) {
				return name as BlockchainsName;
			}
		}
		return undefined;
	}

	transactionsFromWalletHistory(
		transaction_history_data: EvmWalletHistoryTransaction[],
		wallet_data: Wallet,
	): Transaction[] {
		const transactions_data: Transaction[] = transaction_history_data
			.filter(
				(th) =>
					th.possibleSpam === false &&
					// Es relevante en este caso porque es la que paga la fee
					(th.fromAddress.lowercase === wallet_data.address.toLowerCase() ||
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
						coin_address: erc20tx.address.checksum,
						from_address: erc20tx.fromAddress.checksum,
						to_address: erc20tx.toAddress?.checksum ?? null,
						value: BigInt(erc20tx.value),
						token_id: null,
					});
				}

				for (const nativeTx of th.nativeTransfers) {
					transfers.push({
						type: "native",
						from_address: nativeTx.fromAddress.checksum,
						to_address: nativeTx.toAddress?.checksum ?? null,
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
						from_address: nftTx.fromAddress.checksum,
						to_address: nftTx.toAddress?.checksum ?? null,
						value: 0n,
						coin_address: nftTx.tokenAddress.checksum,
						token_id: Number(nftTx.tokenId),
					});
				}

				const decimal_places =
					blockchains[wallet_data.blockchain].decimal_places;

				const fee = Number(
					th.transactionFee
						? th.transactionFee.toString().slice(0, decimal_places)
						: 0,
				);

				return {
					blockchain: wallet_data.blockchain,
					hash: th.hash,
					block_timestamp: new Date(th.blockTimestamp),
					transfers,
					fee: BigInt((fee * 10 ** decimal_places).toFixed(0)),
					from_address: th.fromAddress.checksum,
					to_address: th.toAddress?.checksum ?? null,
					summary: th.summary,
				};
			});
		return transactions_data;
	}
}
