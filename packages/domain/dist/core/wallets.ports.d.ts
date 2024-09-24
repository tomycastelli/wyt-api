import { BlockchainsName } from "./vars";
import { CoinedWallet, Transaction, Wallet } from "./wallets.entities";
export interface WalletsProvider {
    /** Busca una [Wallet] de acuerdo al address y el blockchain */
    getWallet(address: string, blockchain: BlockchainsName): Promise<Wallet>;
    /** Busca las [Transaction]s mas recientes de una [Wallet] */
    getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]>;
    /** Busca el historial de [Transaction]s de una [Wallet] con un cursor para ir paginando */
    getTransactionHistory(wallet_data: Wallet, loop_cursor: string | undefined): Promise<{
        transactions: Transaction[];
        cursor: string | undefined;
    }>;
}
export interface WalletsRepository {
    /** Guarda una [Wallet] */
    saveWallet(wallet_data: CoinedWallet): Promise<void>;
    /** Consigue una [Wallet] guardada con sus [Coin] relacionadas */
    getWallet(address: string, blockchain: BlockchainsName): Promise<CoinedWallet | undefined>;
    /** Consigue una lista de [Wallet]s segun la blockchain */
    getWalletsByBlockchain(blockchain: BlockchainsName, wallets_page: number): Promise<CoinedWallet[]>;
    /** Consigue las [Transaction]s de una [Wallet] de manera paginada */
    getTransactions(wallet_data: Wallet, transactions_page: number): Promise<Transaction[]>;
    /** Guarda una lista de [Transaction]s sin afectar el estado de la [Wallet].
    _Pensado para hacer backfill inicial del historial_ */
    saveTransactions(transactions: Transaction[]): Promise<void>;
    /** Actualiza el backfill status de una [Wallet] */
    updateWalletBackfillStatus(wallet_data: Wallet, status: "complete" | "pending"): Promise<void>;
    /** Guarda una [Transaction] y actualiza el estado de la o las [Wallet]s involucradas  */
    saveTransactionAndUpdateWallet(transaction_data: Transaction, blockchain: BlockchainsName): Promise<void>;
}
//# sourceMappingURL=wallets.ports.d.ts.map