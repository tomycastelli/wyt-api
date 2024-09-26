import { type BlockchainsName, blockchains } from "./vars";
import type {
	CoinedTransaction,
	CoinedWallet,
	SavedWallet,
	Stream,
	Transaction,
	Wallet,
} from "./wallets.entities";

export interface WalletsProvider {
	/** Busca una [Wallet] de acuerdo al address y el blockchain */
	getWallet(address: string, blockchain: BlockchainsName): Promise<Wallet>;
	/** Busca las [Transaction]s mas recientes de una [Wallet] */
	getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]>;
	/** Busca el historial de [Transaction]s de una [Wallet] con un cursor para ir paginando */
	getTransactionHistory(
		wallet_data: Wallet,
		loop_cursor: string | undefined,
	): Promise<{ transactions: Transaction[]; cursor: string | undefined }>;
	/** Crea un nuevo Stream de transacciones */
	createStream(
		webhook_url: string,
		description: string,
		tag: string,
		blockchain: BlockchainsName,
	): Promise<Stream>;
	/** Añade una address a un [Stream] */
	addAddressToStream(stream_id: string, address: string): Promise<void>;
	/** Busca todos los [Stream] existentes */
	getAllStreams(): Promise<Stream[]>;
	/** Busca las addresses relacionadas a un [Stream] */
	getAddresesByStream(stream_id: string): Promise<string[]>;
	/** Verifica y parsea un webhook y devuelve las [Transaction]s
  Devuelve undefined si no es un webhook que nos interese, por ej txs no confirmadas */
	parseWebhookTransaction(
		body: any,
		secret_key: string,
		headers: Record<string, string>,
		blockchain: BlockchainsName,
	): Transaction[] | undefined;
	/** Elimina un [Stream] */
	deleteStream(stream_id: string): Promise<void>;
}

export interface WalletsRepository {
	/** Guarda una [Wallet] y sus [Coin]s relacionadas */
	saveWallet(coined_wallet: CoinedWallet): Promise<SavedWallet>;
	/** Consigue una [Wallet] guardada */
	getWallet(
		address: string,
		blockchain: BlockchainsName,
	): Promise<SavedWallet | undefined>;
	/** Consigue una lista de [Wallet]s segun la blockchain */
	getWalletsByBlockchain(
		blockchain: BlockchainsName,
		wallets_page: number,
	): Promise<SavedWallet[]>;
	/** Consigue las [Transaction]s de una [Wallet] de manera paginada */
	getTransactions(
		wallet_data: SavedWallet,
		transactions_page: number,
	): Promise<Transaction[]>;
	/** Guarda una lista de [Transaction]s sin afectar el estado de la [Wallet].
  _Pensado para hacer backfill inicial del historial_ */
	saveTransactions(transactions: CoinedTransaction[]): Promise<void>;
	/** Actualiza el backfill status de una [Wallet] */
	updateWalletBackfillStatus(
		wallet_data: SavedWallet,
		status: "complete" | "pending",
	): Promise<void>;
	/** Guarda una [Transaction] y actualiza el estado de la o las [Wallet]s involucradas  */
	saveTransactionAndUpdateWallet(
		transaction_data: CoinedTransaction,
		blockchain: BlockchainsName,
	): Promise<void>;
}
