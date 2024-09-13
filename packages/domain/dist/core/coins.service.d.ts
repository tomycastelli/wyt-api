import { Candle, SavedCoin } from "./entities";
import { CoinsProvider, CoinsRepository } from "./ports";
export declare class CoinsService<TProvider extends CoinsProvider, TRepository extends CoinsRepository> {
    private coinsRepository;
    private coinsProvider;
    constructor(coinsRepository: TRepository, coinsProvider: TProvider);
    /** Devuelve todas las [Coin]s disponibles */
    listAllCoins(): Promise<SavedCoin[]>;
    /** Devuelve una [Coin] por id */
    getCoinById(id: number): Promise<SavedCoin | undefined>;
    /** Devuelve una [Coin] por su nombre */
    getCoinByName(coin_name: string): Promise<SavedCoin | undefined>;
    getCoinsByBlockchain(blockchain: string, page_number: number, page_size: number, name_search: string | undefined): Promise<SavedCoin[]>;
    /** Guarda las [Coin]s mas recientes */
    saveLatestCoins(): Promise<SavedCoin[]>;
    /** Guardo todas las [Coin]s disponibles */
    saveAllCoins(): Promise<SavedCoin[]>;
    /** Devuelve todas las [Candle]s guardadas segun el rango */
    getCandlesByDate(frequency: "daily" | "hourly", coin_id: number, from_date?: Date, to_date?: Date): Promise<Candle[] | undefined>;
    /** Guarda las ultimas [Candle] mas recientes segun la frecuencia y la tasa de refresco (cada cuanto se guarda) */
    saveCandles(coin_id: number, frequency: "hourly" | "daily", refresh_rate: number): Promise<undefined>;
    /** Actualiza los datos de mercado relacionados a las coins, para todas las coins disponibles */
    updateMarketData(): Promise<void>;
    searchCoinsByName(name_search: string): Promise<SavedCoin[]>;
}
//# sourceMappingURL=coins.service.d.ts.map