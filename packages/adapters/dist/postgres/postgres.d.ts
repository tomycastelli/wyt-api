import { CoinsRepository, Coin, Candle, CoinMarketData, SavedCoin } from "@repo/domain";
export declare class CoinsPostgres implements CoinsRepository {
    private db;
    constructor(connection_string: string);
    saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
    getAllCoins(): Promise<SavedCoin[]>;
    getCoinById(id: number): Promise<SavedCoin | undefined>;
    getCoinByName(coin_name: string): Promise<SavedCoin | undefined>;
    saveCandles(candles: Candle[]): Promise<void>;
    getCandles(frequency: "hourly" | "daily", coin_id: number, from_date: Date, to_date: Date): Promise<Candle[]>;
    getCoinsByBlockchain(blockchain: string, page_number: number, page_size: number): Promise<SavedCoin[]>;
    saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
}
//# sourceMappingURL=postgres.d.ts.map