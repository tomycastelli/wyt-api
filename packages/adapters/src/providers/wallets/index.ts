import {
	type BlockchainsName,
	type Stream,
	type Transaction,
	type Wallet,
	type WalletsStreamsProvider,
	blockchains,
} from "@repo/domain";
import { BitcoinProvider } from "./bitcoin.js";
import { EthereumProvider } from "./ethereum.js";
import { type RpcEndpoint, SolanaProvider } from "./solana.js";

/** Esta clase agrupa varios providers de distintas blockchains */
export class WalletsProviderAdapters implements WalletsStreamsProvider {
	private ethereumProvider: EthereumProvider;
	private bitcoinProvider: BitcoinProvider;
	private solanaProvider: SolanaProvider;

	constructor(moralis_api_key: string, solana_rpc_endpoints: RpcEndpoint[]) {
		this.ethereumProvider = new EthereumProvider(moralis_api_key);
		this.bitcoinProvider = new BitcoinProvider();
		this.solanaProvider = new SolanaProvider(solana_rpc_endpoints);
	}

	async initialize() {
		await this.ethereumProvider.initialize();
	}

	async getWallet(
		address: string,
		blockchain: BlockchainsName,
	): Promise<Wallet | null> {
		const ecosystem = blockchains[blockchain].ecosystem;
		switch (ecosystem) {
			case "ethereum":
				return this.ethereumProvider.getWallet(address, blockchain);
			case "solana":
				return this.solanaProvider.getWallet(address, blockchain);
			case "bitcoin":
				return this.bitcoinProvider.getWallet(address, blockchain);
		}
	}

	async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
		const ecosystem = blockchains[wallet_data.blockchain].ecosystem;
		switch (ecosystem) {
			case "ethereum":
				return this.ethereumProvider.getRecentTransactions(wallet_data);
			case "solana":
				return this.solanaProvider.getRecentTransactions(wallet_data);
			case "bitcoin":
				return this.bitcoinProvider.getRecentTransactions(wallet_data);
		}
	}

	async getTransactionHistory(
		wallet_data: Wallet,
		loop_cursor: string | undefined,
	): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
		const ecosystem = blockchains[wallet_data.blockchain].ecosystem;
		switch (ecosystem) {
			case "ethereum":
				return this.ethereumProvider.getTransactionHistory(
					wallet_data,
					loop_cursor,
				);
			case "solana":
				return this.solanaProvider.getTransactionHistory(
					wallet_data,
					loop_cursor,
				);
			case "bitcoin":
				return this.bitcoinProvider.getTransactionHistory(
					wallet_data,
					loop_cursor,
				);
		}
	}

	async getAllTransactionsFromDate(
		wallet_data: Wallet,
		from_date: Date,
	): Promise<Transaction[]> {
		const ecosystem = blockchains[wallet_data.blockchain].ecosystem;
		switch (ecosystem) {
			case "ethereum":
				return this.ethereumProvider.getAllTransactionsFromDate(
					wallet_data,
					from_date,
				);
			case "solana":
				return this.solanaProvider.getAllTransactionsFromDate(
					wallet_data,
					from_date,
				);
			case "bitcoin":
				return this.bitcoinProvider.getAllTransactionsFromDate(
					wallet_data,
					from_date,
				);
		}
	}

	// Por ahora los streams son solo en Ethereum

	async addAddressToStream(stream_id: string, address: string): Promise<void> {
		return this.ethereumProvider.addAddressToStream(stream_id, address);
	}

	async createStream(
		webhook_url: string,
		description: string,
		tag: string,
		blockchain: BlockchainsName,
	): Promise<Stream> {
		return this.ethereumProvider.createStream(
			webhook_url,
			description,
			tag,
			blockchain,
		);
	}

	async deleteStream(stream_id: string): Promise<void> {
		return this.ethereumProvider.deleteStream(stream_id);
	}

	async getAddresesByStream(stream_id: string): Promise<string[]> {
		return this.ethereumProvider.getAddresesByStream(stream_id);
	}

	async getAllStreams(): Promise<Stream[]> {
		return this.ethereumProvider.getAllStreams();
	}

	validateWebhookTransaction(
		body: any,
		secret_key: string,
		headers: Record<string, string>,
	): boolean {
		return this.ethereumProvider.validateWebhookTransaction(
			body,
			secret_key,
			headers,
		);
	}

	parseWebhookTransaction(
		body: any,
		blockchain: BlockchainsName,
	): Transaction[] | undefined {
		return this.ethereumProvider.parseWebhookTransaction(body, blockchain);
	}
}

// class BitcoinProvider implements WalletsProvider {}
