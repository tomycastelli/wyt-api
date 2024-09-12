declare const coinMarketDataType: import("arktype/internal/methods/object.ts").ObjectType<{
    market_cap: number;
    price: number;
    price_change_24h: number;
    ath: number;
    name: string;
}, {}>;
declare const coinType: import("arktype/internal/methods/object.ts").ObjectType<{
    market_cap: number;
    price: number;
    price_change_24h: number;
    ath: number;
    name: string;
    symbol: string;
    provider: string;
    contracts: {
        blockchain: string;
        address: string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
        };
    }[];
    description: string | null;
    image_url: (string & {
        " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"url">;
    }) | null;
}, {}>;
declare const savedCoinType: import("arktype/internal/methods/object.ts").ObjectType<{
    market_cap: number;
    price: number;
    price_change_24h: number;
    ath: number;
    name: string;
    symbol: string;
    provider: string;
    contracts: {
        blockchain: string;
        address: string & {
            " arkConstrained": import("arktype/internal/keywords/ast.ts").Branded<"alphanumeric">;
        };
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
/** # Representacion de una criptomoneda. Cada [Coin] esta asociada a una fuente de información */
export type Coin = typeof coinType.infer;
export type CoinMarketData = typeof coinMarketDataType.infer;
/** # Una criptomoneda guardada previamente en alguna base de datos */
export type SavedCoin = typeof savedCoinType.infer;
/** # Vela OHCL en un punto de tiempo para un par coin-fiat */
export type Candle = typeof candleType.infer;
export {};
//# sourceMappingURL=entities.d.ts.map