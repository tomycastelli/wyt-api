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

  /** Busca el primer y último bloque de una [Wallet] */
  getWalletTimes(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<{
    first_block: number;
    last_block: number;
    first_date: Date;
  }>;

  /** Busca el historial de [Transaction]s de una [Wallet] con un cursor para ir paginando */
  getTransactionHistory(
    address: string,
    blockchain: BlockchainsName,
    from_block: number,
    to_block: number,
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
  updateWallet(
    wallet_id: number,
    new_data: CoinedWallet,
    transaction_frequency: number,
  ): Promise<void>;

  /** Consigue una [Wallet] guardada */
  getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedWallet | undefined>;

  /** Chequea la existencia de una [Wallet], es mas rapido */
  walletExists(address: string, blockchain: BlockchainsName): Promise<boolean>;

  /** Consigue las [Wallet]s cuyo historial no esta completo */
  getPendingWallets(): Promise<SavedWallet[]>;

  /** Consigue una lista de [Wallet]s segun la blockchain con un filtrado por ids opcional. \
  Tamaño de página: **10** */
  getWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
    ids: number[] | undefined,
    include_nfts: boolean,
  ): Promise<SavedWallet[]>;

  /** Consigue una lista de [Wallet]s segun un rango de frecuencia de transacciones */
  getWalletsByTransactionFrequency(
    from_frequency: number,
    to_frequency: number | null,
  ): Promise<SavedWallet[]>;

  /** Consigue las [Transaction]s de una [Wallet] de manera paginada y descendente  \
  - Si la pagina es 0, devuelve todas las transacciones \
  - Acepta un rango de fechas opcional.
  */
  getTransactions(
    wallet_address: string,
    blockchain: BlockchainsName,
    transactions_page: number,
    from_date: Date | undefined,
    to_date: Date | undefined,
  ): Promise<Transaction[]>;

  /** Consigue la [Transaction] mas reciente o mas vieja insertada. Segun el order pasado */
  getLatestTransactionDate(
    wallet_data: Wallet,
    order: "DESC" | "ASC",
  ): Promise<Date | null>;

  /** Guarda la valuación de una [Wallet] en USD en un momento dado */
  saveWalletValuations(
    valuations: { wallet_id: number; timestamp: Date; value_usd: number }[],
  ): Promise<void>;

  /** Consigue la valuación de la [Wallet] dada una fecha */
  getWalletValuation(
    wallet_id: number,
    timestamp: Date,
  ): Promise<number | undefined>;

  /** Consigue la valuación de la [Wallet] dado un rango */
  getWalletValuations(
    wallet_id: number,
    from_date: Date,
    to_date: Date,
  ): Promise<number[]>;

  /** Guarda una lista de [Transaction]s sin afectar el estado de la [Wallet].
  _Pensado para hacer backfill inicial del historial o actualizar redes sin transacciones detalladas_ */
  saveTransactions(
    transactions: CoinedTransaction[],
    blockchain: BlockchainsName,
  ): Promise<void>;

  /** Actualiza el backfill status de una [Wallet] a completado */
  updateWalletBackfillStatus(
    address: string,
    blockchain: BlockchainsName,
    new_status: "complete" | "active" | "pending",
    first_date?: Date,
  ): Promise<void>;

  /** Guarda una [Transaction] y actualiza el estado de la o las [Wallet]s involucradas  */
  saveTransactionAndUpdateWallet(
    transaction_data: CoinedTransaction,
  ): Promise<void>;
}
