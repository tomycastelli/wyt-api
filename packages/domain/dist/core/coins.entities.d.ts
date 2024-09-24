declare const coinMarketDataType: import("arktype/internal/methods/object.ts").ObjectType<{
    market_cap: number;
    price: number;
    price_change_percentage_24h: number;
    price_change_24h: number;
    ath: number;
    name: string;
}, {}>;
export declare const coinType: import("arktype/internal/methods/object.ts").ObjectType<{
    market_cap: number;
    price: number;
    price_change_percentage_24h: number;
    price_change_24h: number;
    ath: number;
    name: string;
    symbol: string;
    provider: string;
    contracts: {
        blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
        contract_address: string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
        };
        decimal_place: number;
    }[];
    description: string | null;
    image_url: (string & {
        " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
    }) | null;
}, {}>;
export declare const savedCoinType: import("arktype/internal/methods/object.ts").ObjectType<{
    market_cap: number;
    price: number;
    price_change_percentage_24h: number;
    price_change_24h: number;
    ath: number;
    name: string;
    symbol: string;
    provider: string;
    contracts: {
        blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
        contract_address: string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
        };
        decimal_place: number;
    }[];
    description: string | null;
    image_url: (string & {
        " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
    }) | null;
    id: import("arktype/internal/keywords/number/integer.ts").integer;
}, {}>;
declare const candleType: import("arktype/internal/methods/object.ts").ObjectType<{
    coin_id: import("arktype/internal/keywords/number/integer.ts").integer;
    frequency: "daily" | "hourly";
    timestamp: Date;
    open: import("arktype/internal/keywords/number/integer.ts").integer;
    high: import("arktype/internal/keywords/number/integer.ts").integer;
    low: import("arktype/internal/keywords/number/integer.ts").integer;
    close: import("arktype/internal/keywords/number/integer.ts").integer;
}, {}>;
export declare const nftType: import("arktype/internal/methods/object.ts").ObjectType<{
    name: string;
    symbol: string;
    provider: string;
    contract_address: string;
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    image_url: string;
    description: string | null;
    token_id: number;
    price: number;
}, {}>;
export declare const savedNftType: import("arktype/internal/methods/object.ts").ObjectType<{
    name: string;
    symbol: string;
    provider: string;
    contract_address: string;
    blockchain: "bitcoin" | "ethereum" | "solana" | "polygon-pos" | "binance-smart-chain" | "avalanche";
    image_url: string;
    description: string | null;
    token_id: number;
    price: number;
    id: import("arktype/internal/keywords/number/integer.ts").integer;
}, {}>;
/** # Representacion de una criptomoneda. Cada [Coin] esta asociada a una fuente de información */
export type Coin = typeof coinType.infer;
/** # Datos de mercado de una criptomoneda */
export type CoinMarketData = typeof coinMarketDataType.infer;
/** # Una criptomoneda guardada previamente en una base de datos */
export type SavedCoin = typeof savedCoinType.infer;
/** # Un NFT en una red blockchain */
export type NFT = typeof nftType.infer;
/** # Una NFT guardada previamente en una base de datos */
export type SavedNFT = typeof savedNftType.infer;
/** # Vela OHCL en un punto de tiempo para un par coin-fiat */
export type Candle = typeof candleType.infer;
export {};
//# sourceMappingURL=coins.entities.d.ts.map