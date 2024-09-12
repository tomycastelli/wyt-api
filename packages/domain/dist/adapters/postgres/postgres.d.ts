import { Candle, Coin, CoinMarketData, SavedCoin } from "../../core/entities";
import { CoinsRepository } from "../../core/ports";
export default class CoinsPostgres implements CoinsRepository {
    private db;
    constructor(connection_string: string);
    saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
    getAllCoins(): Promise<SavedCoin[]>;
    getCoinById(id: number): Promise<SavedCoin>;
    getCoinByName(coin_name: string): Promise<SavedCoin>;
    saveCandles(candles: Candle[]): Promise<void>;
    getCandles(interval: "hourly" | "daily", coin_id: number, from_date: Date, to_date: Date): Promise<Candle[]>;
    getCoinsByBlockchain(blockchain: string, page_number: number, page_size: number, name_search: string | undefined): Promise<SavedCoin[]>;
    saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
}
//# sourceMappingURL=postgres.d.ts.map