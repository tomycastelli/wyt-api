import { BlockchainsName, Candle, Coin, CoinMarketData, CoinsRepository, SavedCoin, NFT, SavedNFT } from "@repo/domain";
export declare class CoinsPostgres implements CoinsRepository {
    private db;
    constructor(connection_string: string);
    saveCoins(coins: Coin[]): Promise<SavedCoin[]>;
    getAllCoins(): Promise<SavedCoin[]>;
    getCoinById(id: number): Promise<SavedCoin | undefined>;
    getCoinByName(coin_name: string): Promise<SavedCoin | undefined>;
    getCoinByAddress(coin_address: string, blockchain: BlockchainsName): Promise<SavedCoin | undefined>;
    saveNFTs(nfts: NFT[]): Promise<SavedNFT[]>;
    getNFTByAddress(contract_address: string, token_id: number): Promise<SavedNFT | undefined>;
    saveCandles(candles: Candle[]): Promise<void>;
    getCandles(frequency: "hourly" | "daily", coin_id: number, from_date: Date, to_date: Date): Promise<Candle[]>;
    getCoinsByBlockchain(blockchain: BlockchainsName, page_number: number, page_size: number): Promise<SavedCoin[]>;
    saveMarketData(coin_market_data: CoinMarketData[]): Promise<void>;
}
//# sourceMappingURL=coins.repository.d.ts.map