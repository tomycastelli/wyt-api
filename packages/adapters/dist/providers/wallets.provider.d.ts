import { BlockchainsName, Transaction, Wallet, WalletsProvider } from "@repo/domain";
/** Esta clase agrupa varios providers de distintas blockchains */
export declare class WalletsProviderAdapters implements WalletsProvider {
    private ethereumProvider;
    constructor(moralis_api_key: string, blockchain_com_api_key: string, solana_rpc_endpoint: string);
    initialize(): Promise<void>;
    getWallet(address: string, blockchain: BlockchainsName): Promise<Wallet>;
    getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]>;
    getTransactionHistory(wallet_data: Wallet, loop_cursor: string | undefined): Promise<{
        transactions: Transaction[];
        cursor: string | undefined;
    }>;
}
//# sourceMappingURL=wallets.provider.d.ts.map