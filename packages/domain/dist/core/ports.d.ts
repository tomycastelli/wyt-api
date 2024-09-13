import { Candle, Coin, CoinMarketData, SavedCoin } from "./entities";
export type SavedCandles = {
    amount: number;
    save_time: Date;
};
export interface CoinsRepository {
    saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
    saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
    saveCandles(candles: Candle[]): Promise<void>;
    getAllCoins(): Promise<SavedCoin[]>;
    getCoinsByBlockchain(blockchain: string, page_number: number, page_size: number): Promise<SavedCoin[]>;
    getCandles(frequency: "hourly" | "daily", coin_id: number, from_date: Date, to_date: Date): Promise<Candle[]>;
    getCoinById(coin_id: number): Promise<SavedCoin | undefined>;
    getCoinByName(coin_name: string): Promise<SavedCoin | undefined>;
}
export interface CoinsProvider {
    /** Devuelve todos los [CoinMarketData] disponibles */
    getAllCoinMarketData(): Promise<CoinMarketData[]>;
    /** Consigue todas las tokens existentes
    # Se debe correr de vez en cuando ya es una query grande */
    getAllCoins(blockchains: string[], base_coins: string[], minimum_market_cap: number): Promise<Coin[]>;
    /** Consigue las ultimas coins añadidas */
    getLatestCoins(blockchains: string[], minimum_market_cap: number): Promise<Coin[]>;
    /** Consigue las candelas del tipo elegido */
    getCandleData(frequency: "hourly" | "daily", coin_name: string, refresh_rate: number): Promise<Omit<Candle, "coin_id">[]>;
}
//# sourceMappingURL=ports.d.ts.map