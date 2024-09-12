import { Candle, SavedCoin } from "./entities";
export declare class CoinsService {
    private coinsRepository;
    private coinsProvider;
    constructor(postgres_url: string, coingecko_api_key: string);
    /** Devuelve todas las [Coin]s disponibles */
    listAllCoins(): Promise<SavedCoin[]>;
    /** Devuelve una [Coin] por id */
    getCoinById(id: number): Promise<SavedCoin>;
    /** Devuelve una [Coin] por su nombre */
    getCoinByName(coin_name: string): Promise<SavedCoin>;
    getCoinsByBlockchain(blockchain: string, page_number: number, page_size: number, name_search: string | undefined): Promise<SavedCoin[]>;
    /** Guarda las [Coin]s mas recientes */
    saveLatestCoins(): Promise<SavedCoin[]>;
    /** Guardo todas las [Coin]s disponibles */
    saveAllCoins(): Promise<SavedCoin[]>;
    /** Devuelve todas las [Candle]s guardadas segun el rango */
    getCandlesByDate(frequency: "daily" | "hourly", coin_id: number, from_date?: Date, to_date?: Date): Promise<Candle[]>;
    /** Guarda las ultimas [Candle] mas recientes segun la frecuencia y la tasa de refresco (cada cuanto se guarda) */
    saveCandles(coin_id: number, frequency: "hourly" | "daily", refresh_rate: number): Promise<void>;
    updateMarketData(): Promise<void>;
}
//# sourceMappingURL=coins.service.d.ts.map