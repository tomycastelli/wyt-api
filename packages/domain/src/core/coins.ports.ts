import type {
  Candle,
  Coin,
  CoinMarketData,
  SavedCoin,
  SavedNFT,
} from "./coins.entities.js";
import type { BlockchainsName } from "./vars.js";

export type SavedCandles = {
  amount: number;
  save_time: Date;
};

// El contrato al que se tienen que adherir los repositorios de informacion
export interface CoinsRepository {
  saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
  saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
  saveCandles(candles: Candle[]): Promise<void>;

  getAllCoins(
    minimum_market_cap: number,
    maximum_market_cap?: number,
  ): Promise<SavedCoin[]>;
  getCoinsByBlockchain(
    blockchain: string,
    page_number: number,
    page_size: number,
    ids: number[] | undefined,
  ): Promise<SavedCoin[]>;
  getCandlesByDateRange(
    frequency: "hourly" | "daily",
    coin_id: number,
    from_date: Date,
    to_date: Date,
  ): Promise<Candle[]>;

  /** Devuelve todas las candelas que se encuentren en los tiempos dados */
  getCandlesByDateList(
    frequency: "hourly" | "daily",
    coin_ids: number[],
    timestamps: Date[],
  ): Promise<Candle[]>;
  getCoinById(coin_id: number): Promise<SavedCoin | undefined>;
  getCoinByName(coin_name: string): Promise<SavedCoin | undefined>;
  getCoinByAddress(
    coin_address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedCoin | undefined>;

  // Devuelve una [NFT], la inserta si no existe
  getNFTByAddress(
    contract_address: string,
    token_id: number,
    blockchain: BlockchainsName,
  ): Promise<SavedNFT>;
}

// El contrato al que se tienen que adherir las fuentes de informacion
export interface CoinsProvider {
  /** Devuelve todos los [CoinMarketData] disponibles */
  getAllCoinMarketData(coin_names?: string[]): Promise<CoinMarketData[]>;

  /** Consigue todas las tokens existentes */
  getAllCoins(): Promise<
    {
      name: string;
      symbol: string;
      display_name: string;
      platforms: Record<string, string>;
    }[]
  >;

  /** Dado el name de una coin, consigue sus detalles */
  getCoinDetails(
    coin: {
      name: string;
      display_name: string;
      symbol: string;
      platforms: Record<string, string>;
    },
    minimum_market_cap: number,
  ): Promise<Coin | null>;

  /** Consigue las ultimas coins añadidas */
  getLatestCoins(minimum_market_cap: number): Promise<Coin[]>;

  /** Consigue una [Coin] por su contract address */
  getCoinsByAddress(
    coin_address: string[],
    blockchain: BlockchainsName,
  ): Promise<Coin[]>;

  /** Consigue las candelas del tipo elegido */
  getCandleData(
    frequency: "hourly" | "daily",
    coin_name: string,
    // Cada cuantos dias o cada cuantas horas se ejecuta
    // Esto va a determinar cuantas candelas desde ahora hacia atrás devuelve
    refresh_rate: number,
  ): Promise<Omit<Candle, "coin_id">[]>;

  /** Consigue las candelas dado un rango */
  getCandlesByDateRange(
    frequency: "hourly" | "daily",
    coin_name: string,
    from_date: Date,
    to_date: Date,
  ): Promise<Omit<Candle, "coin_id">[]>;
}
