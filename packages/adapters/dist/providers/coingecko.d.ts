import { CoinsProvider, Candle, Coin, CoinMarketData } from "@repo/domain";
import { LimitFunction } from "p-limit";
export declare class CoinGecko implements CoinsProvider {
    readonly base_url: string;
    readonly blockchains_categories: string[];
    readonly rate_limit: LimitFunction;
    private request_data;
    constructor(api_key: string);
    getAllCoins(blockchains: string[], base_coins: string[], minimum_market_cap: number): Promise<Coin[]>;
    getCandleData(frequency: "hourly" | "daily", coin_name: string, refresh_rate: number): Promise<Omit<Candle, "coin_id">[]>;
    getLatestCoins(blockchains: string[], minimum_market_cap: number): Promise<Coin[]>;
    getAllCoinMarketData(): Promise<CoinMarketData[]>;
}
//# sourceMappingURL=coingecko.d.ts.map