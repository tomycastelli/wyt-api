import { Candle, SavedCoin } from "./entities";
import { CoinsProvider, CoinsRepository } from "./ports";
import { base_coins, blockchains } from "./vars";
import CoinsPostgres from "../adapters/postgres/postgres";
import CoinGecko from "../adapters/providers/coingecko";

/// Logica de negocio para el servicio de Tokens
// Quiero que haga las siguientes acciones:
// - Conseguir todas las [Blockchain]s existentes
// - Conseguir todas las [Coin]s disponibles
// - Conseguir detalles de un [Coin]
// - Informacion diaria de [Candle]s
// - Informacion horaria de [Candle]s

// Importante: Al servicio de Tokens no le importa la fuente de las coins
// De eso se encarga el repositorio que interactua con la DB

export class CoinsService {
  private coinsRepository: CoinsRepository;
  private coinsProvider: CoinsProvider;

  constructor(postgres_url: string, coingecko_api_key: string) {
    this.coinsRepository = new CoinsPostgres(postgres_url);
    this.coinsProvider = new CoinGecko(coingecko_api_key);
  }

  /** Devuelve todas las [Coin]s disponibles */
  public async listAllCoins(): Promise<SavedCoin[]> {
    return await this.coinsRepository.getAllCoins();
  }

  /** Devuelve una [Coin] por id */
  public async getCoinById(id: number): Promise<SavedCoin> {
    return await this.coinsRepository.getCoinById(id);
  }

  /** Devuelve una [Coin] por su nombre */
  public async getCoinByName(coin_name: string): Promise<SavedCoin> {
    return await this.coinsRepository.getCoinByName(coin_name);
  }

  public async getCoinsByBlockchain(
    blockchain: string,
    page_number: number,
    page_size: number,
    name_search: string | undefined,
  ): Promise<SavedCoin[]> {
    return await this.coinsRepository.getCoinsByBlockchain(
      blockchain,
      page_number,
      page_size,
      name_search,
    );
  }

  /** Guarda las [Coin]s mas recientes */
  public async saveLatestCoins(): Promise<SavedCoin[]> {
    const latestCoins = await this.coinsProvider.getLatestCoins(
      blockchains,
      10_000,
    );
    const savedCoins = await this.coinsRepository.saveCoins(latestCoins);
    return savedCoins;
  }

  /** Guardo todas las [Coin]s disponibles */
  public async saveAllCoins(): Promise<SavedCoin[]> {
    // Pido coins con capitalizacion mayor a 10_000 USD
    const allCoins = await this.coinsProvider.getAllCoins(
      blockchains,
      base_coins,
      10_000,
    );
    const savedCoins = await this.coinsRepository.saveCoins(allCoins);
    return savedCoins;
  }

  /** Devuelve todas las [Candle]s guardadas segun el rango */
  public async getCandlesByDate(
    type: "daily" | "hourly",
    coin_id: number,
    from_date: Date,
    to_date: Date,
  ): Promise<Candle[]> {
    return await this.coinsRepository.getCandles(
      type,
      coin_id,
      from_date,
      to_date,
    );
  }

  /** Guarda las ultimas [Candle] mas recientes segun el intervalo y la frecuencia */
  public async saveCandles(
    coin_id: number,
    interval: "hourly" | "daily",
    frequency: number,
  ) {
    const savedCoin = await this.coinsRepository.getCoinById(coin_id);
    const candles = await this.coinsProvider.getCandleData(
      interval,
      savedCoin.name,
      frequency,
    );
    await this.coinsRepository.saveCandles(
      candles.map((c) => ({ coin_id, ...c })),
    );
  }

  public async updateMarketData(): Promise<void> {
    const market_data = await this.coinsProvider.getAllCoinMarketData();
    await this.coinsRepository.saveMarketData(market_data);
  }
}
