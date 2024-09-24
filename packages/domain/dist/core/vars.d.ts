export declare const blockchains: {
    readonly bitcoin: {
        readonly ecosystem: "bitcoin";
        readonly coin: "bitcoin";
        readonly decimal_places: 8;
    };
    readonly ethereum: {
        readonly ecosystem: "ethereum";
        readonly coin: "ethereum";
        readonly decimal_places: 18;
    };
    readonly solana: {
        readonly ecosystem: "solana";
        readonly coin: "solana";
        readonly decimal_places: 9;
    };
    readonly "polygon-pos": {
        readonly ecosystem: "ethereum";
        readonly coin: "matic-network";
        readonly decimal_places: 18;
    };
    readonly "binance-smart-chain": {
        readonly ecosystem: "ethereum";
        readonly coin: "binancecoin";
        readonly decimal_places: 18;
    };
    readonly avalanche: {
        readonly ecosystem: "ethereum";
        readonly coin: "avalanche-2";
        readonly decimal_places: 18;
    };
};
export type BlockchainsName = keyof typeof blockchains;
export declare const EveryBlockainsName: BlockchainsName[];
export declare const base_coins: ("bitcoin" | "ethereum" | "solana" | "matic-network" | "binancecoin" | "avalanche-2")[];
export type BlockchainCoin = (typeof blockchains)[keyof typeof blockchains]["coin"];
export declare const providers: string[];
//# sourceMappingURL=vars.d.ts.map