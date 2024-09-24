import { CoinsProvider, Candle, Coin, CoinMarketData, BlockchainsName, NFT } from "@repo/domain";
import { LimitFunction } from "p-limit";
export declare class CoinGecko implements CoinsProvider {
    readonly base_url: string;
    private readonly blockchains_categories;
    private readonly blockchains_to_networks_mapper;
    readonly rate_limit: LimitFunction;
    request_data: RequestInit;
    constructor(api_key: string);
    getAllCoins(minimum_market_cap: number): Promise<Coin[]>;
    getCandleData(frequency: "hourly" | "daily", coin_name: string, refresh_rate: number): Promise<Omit<Candle, "coin_id">[]>;
    getLatestCoins(blockchains: string[], minimum_market_cap: number): Promise<Coin[]>;
    getCoinByAddress(coin_address: string, blockchain: BlockchainsName): Promise<Coin>;
    getAllCoinMarketData(): Promise<CoinMarketData[]>;
    getCoinMarketData(coin_name: string): Promise<CoinMarketData>;
    getAllHistoricalCandles(frequency: "hourly" | "daily", coin_name: string): Promise<Omit<Candle, "coin_id">[]>;
    getNFTByAddress(contract_address: string, blockchain: BlockchainsName): Promise<Omit<NFT, "token_id">>;
}
//# sourceMappingURL=coins.provider.d.ts.map