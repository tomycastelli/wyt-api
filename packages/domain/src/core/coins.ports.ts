import {
	type Candle,
	type Coin,
	type CoinMarketData,
	NFT,
	type SavedCoin,
	type SavedNFT,
} from "./coins.entities";
import type { BlockchainsName } from "./vars";

export type SavedCandles = {
	amount: number;
	save_time: Date;
};

// El contrato al que se tienen que adherir los repositorios de informacion
export interface CoinsRepository {
	saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
	saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
	saveCandles(candles: Candle[]): Promise<void>;

	getAllCoins(minimum_market_cap?: number): Promise<SavedCoin[]>;
	getCoinsByBlockchain(
		blockchain: string,
		page_number: number,
		page_size: number,
	): Promise<SavedCoin[]>;
	getCandles(
		frequency: "hourly" | "daily",
		coin_id: number,
		from_date: Date,
		to_date: Date,
	): Promise<Candle[]>;

	/** Devuelve todas las candelas que se encuentren en los tiempos dados */
	getCandlesByDateList(
		frequency: "hourly" | "daily",
		coin_id: number,
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

	/** Devuelve el [CoinMarketData] de una Coin en especifico */
	getCoinMarketData(coin_name: string): Promise<CoinMarketData>;

	/** Consigue todas las tokens existentes
  # Se debe correr de vez en cuando ya es una query grande */
	getAllCoins(minimum_market_cap: number): Promise<Coin[]>;

	/** Consigue las ultimas coins añadidas */
	getLatestCoins(
		blockchains: string[],
		minimum_market_cap: number,
	): Promise<Coin[]>;

	/** Consigue una [Coin] por su contract address */
	getCoinByAddress(
		coin_address: string,
		blockchain: BlockchainsName,
	): Promise<Coin | null>;

	/** Consigue las candelas del tipo elegido */
	getCandleData(
		frequency: "hourly" | "daily",
		coin_name: string,
		// Cada cuantos dias o cada cuantas horas se ejecuta
		// Esto va a determinar cuantas candelas desde ahora hacia atrás devuelve
		refresh_rate: number,
	): Promise<Omit<Candle, "coin_id">[]>;

	/** Consigue todas las candelas historicas, puede ser un array muy largo, habria que testear eso */
	getCoinHistorialCandles(
		frequency: "hourly" | "daily",
		coin_name: string,
		date_cursor: number,
	): Promise<{ candles: Omit<Candle, "coin_id">[]; date_cursor: number }>;
}
