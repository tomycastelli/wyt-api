import { Candle, Coin, CoinMarketData, NFT, SavedCoin, SavedNFT } from "./coins.entities";
import { BlockchainsName } from "./vars";
export type SavedCandles = {
    amount: number;
    save_time: Date;
};
export interface CoinsRepository {
    saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
    saveNFTs(nfts: NFT[]): Promise<SavedNFT[]>;
    saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
    saveCandles(candles: Candle[]): Promise<void>;
    getAllCoins(): Promise<SavedCoin[]>;
    getCoinsByBlockchain(blockchain: string, page_number: number, page_size: number): Promise<SavedCoin[]>;
    getCandles(frequency: "hourly" | "daily", coin_id: number, from_date: Date, to_date: Date): Promise<Candle[]>;
    getCoinById(coin_id: number): Promise<SavedCoin | undefined>;
    getCoinByName(coin_name: string): Promise<SavedCoin | undefined>;
    getCoinByAddress(coin_address: string, blockchain: BlockchainsName): Promise<SavedCoin | undefined>;
    getNFTByAddress(contract_address: string, token_id: number): Promise<SavedNFT | undefined>;
}
export interface CoinsProvider {
    /** Devuelve todos los [CoinMarketData] disponibles */
    getAllCoinMarketData(): Promise<CoinMarketData[]>;
    /** Devuelve el [CoinMarketData] de una Coin en especifico */
    getCoinMarketData(coin_name: string): Promise<CoinMarketData>;
    /** Consigue todas las tokens existentes
    # Se debe correr de vez en cuando ya es una query grande */
    getAllCoins(minimum_market_cap: number): Promise<Coin[]>;
    /** Consigue las ultimas coins añadidas */
    getLatestCoins(blockchains: string[], minimum_market_cap: number): Promise<Coin[]>;
    /** Consigue una [Coin] por su contract address */
    getCoinByAddress(coin_address: string, blockchain: BlockchainsName): Promise<Coin>;
    /** Consigue una [NFT] por su contract address */
    getNFTByAddress(contract_address: string, blockchain: BlockchainsName): Promise<Omit<NFT, "token_id">>;
    /** Consigue las candelas del tipo elegido */
    getCandleData(frequency: "hourly" | "daily", coin_name: string, refresh_rate: number): Promise<Omit<Candle, "coin_id">[]>;
    /** Consigue todas las candelas historicas, puede ser un array muy largo, habria que testear eso */
    getAllHistoricalCandles(frequency: "hourly" | "daily", coin_name: string): Promise<Omit<Candle, "coin_id">[]>;
}
//# sourceMappingURL=coins.ports.d.ts.map