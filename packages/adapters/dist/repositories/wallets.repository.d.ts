import { BlockchainsName, CoinedWallet, Transaction, Wallet, WalletsRepository } from "@repo/domain";
import { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
export declare class WalletsPostgres implements WalletsRepository {
    private db;
    constructor(connection_string: string);
    saveWallet(coined_wallet: CoinedWallet): Promise<void>;
    getWallet(address: string, blockchain: BlockchainsName): Promise<CoinedWallet | undefined>;
    getWalletsByBlockchain(blockchain: BlockchainsName, wallets_page: number): Promise<CoinedWallet[]>;
    saveTransactions(transactions: Transaction[]): Promise<void>;
    saveTransactionAndUpdateWallet(transaction_data: Transaction): Promise<void>;
    getTransactions(wallet_data: Wallet, transactions_page: number): Promise<Transaction[]>;
    updateWalletBackfillStatus(wallet_data: Wallet, status: "complete" | "pending"): Promise<void>;
    getCoinIdOfTransaction(transaction_data: Transaction, tx: PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>): Promise<number>;
}
//# sourceMappingURL=wallets.repository.d.ts.map