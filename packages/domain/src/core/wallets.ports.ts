import type { BlockchainsName } from "./vars.js";
import type {
  CoinedTransaction,
  CoinedWallet,
  SavedWallet,
  Stream,
  Transaction,
  Wallet,
} from "./wallets.entities.js";

export interface WalletsProvider {
  /** Busca una [Wallet] de acuerdo al address y el blockchain
  Devuelve null si no existe o no cumple con los parametros para ser añadida */
  getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet | null>;

  /** Busca las [Transaction]s mas recientes de una [Wallet] con una cantidad arbitrario */
  getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]>;

  /** Busca la primera y última transacción de una [Wallet] */
  getWalletTimes(
    wallet_data: Wallet,
  ): Promise<{ first_transaction: Date; last_transaction: Date }>;

  /** Busca el historial de [Transaction]s de una [Wallet] con un cursor para ir paginando */
  getTransactionHistory(
    address: string,
    blockchain: BlockchainsName,
    from_date: Date,
    to_date: Date,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }>;

  /** Busca todas [Transaction]s apartir de cierta fecha */
  getAllTransactionsFromDate(
    wallet_data: Wallet,
    from_date: Date,
  ): Promise<Transaction[]>;
}

export interface WalletsStreamsProvider extends WalletsProvider {
  /** Crea un nuevo Stream de transacciones. Tanto ERC20 como NFTs */
  createStreams(
    webhook_url: string,
    description: string,
    tag: string,
    blockchain: BlockchainsName,
  ): Promise<Stream[]>;

  /** Añade una address a un [Stream] */
  addAddressToStreams(stream_ids: string[], address: string): Promise<void>;

  /** Busca todos los [Stream] existentes */
  getAllStreams(): Promise<Stream[]>;

  /** Busca las addresses relacionadas a un [Stream] */
  getAddresesByStream(stream_id: string): Promise<string[]>;

  /** Get failed webhooks */
  getFailedWebhooks(): Promise<{ body: any; blockchain: BlockchainsName }[]>;

  /** Verifica y parsea un webhook y devuelve las [Transaction]s
  Devuelve undefined si no es un webhook que nos interese, por ej txs no confirmadas */
  parseWebhookTransaction(
    body: any,
    blockchain: BlockchainsName,
  ): Transaction[] | undefined;

  /** Verifica un webhook */
  validateWebhookTransaction(
    body: any,
    secret_key: string,
    headers: Record<string, string>,
  ): boolean;

  /** Elimina un [Stream] */
  deleteStream(stream_id: string): Promise<void>;
}

export interface WalletsRepository {
  /** Guarda una [Wallet] y sus [Coin]s relacionadas */
  saveWallet(coined_wallet: CoinedWallet): Promise<SavedWallet>;

  /** Actualiza el portfolio de una [Wallet] */
  updateWallet(wallet_id: number, new_data: CoinedWallet): Promise<void>;

  /** Consigue una [Wallet] guardada */
  getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedWallet | undefined>;

  /** Consigue las [Wallet]s cuyo historial no esta completo */
  getPendingWallets(): Promise<SavedWallet[]>;

  /** Consigue una lista de [Wallet]s segun la blockchain con un filtrado por ids opcional. \
  Tamaño de página: **20** */
  getWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
    ids?: number[],
  ): Promise<SavedWallet[]>;

  /** Consigue las [Transaction]s de una [Wallet] de manera paginada y descendente  \
  Acepta un rango de fechas opcional
  */
  getTransactions(
    wallet_address: string,
    transactions_page: number,
    from_date: Date | undefined,
    to_date: Date | undefined,
  ): Promise<Transaction[]>;

  /** Consigue las [Transaction]s de una [Wallet] en un rango de tiempo */
  getTransactionsByRange(
    wallet_address: string,
    from_date: Date,
    to_date: Date,
  ): Promise<Transaction[]>;

  /** Consigue la [Transaction] mas reciente o mas vieja insertada. Segun el order pasado */
  getLatestTransactionDate(
    wallet_data: Wallet,
    order: "DESC" | "ASC",
  ): Promise<Date | null>;

  /** Guarda una lista de [Transaction]s sin afectar el estado de la [Wallet].
  _Pensado para hacer backfill inicial del historial o actualizar redes sin transacciones detalladas_ */
  saveTransactions(transactions: CoinedTransaction[]): Promise<void>;

  /** Actualiza el backfill status de una [Wallet] a completado */
  updateWalletBackfillStatus(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<void>;

  /** Guarda una [Transaction] y actualiza el estado de la o las [Wallet]s involucradas  */
  saveTransactionAndUpdateWallet(
    transaction_data: CoinedTransaction,
  ): Promise<void>;
}
