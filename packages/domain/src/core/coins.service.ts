import { Candle, SavedCoin, SavedNFT } from "./coins.entities";
import { CoinsProvider, CoinsRepository } from "./coins.ports";
import { base_coins, blockchains, BlockchainsName } from "./vars";
import moment from "moment";
import Fuse from "fuse.js";

/// Logica de negocio para el servicio de Tokens
// Quiero que haga las siguientes acciones:
// - Conseguir todas las [Blockchain]s existentes
// - Conseguir todas las [Coin]s disponibles
// - Conseguir detalles de un [Coin]
// - Informacion diaria de [Candle]s
// - Informacion horaria de [Candle]s

// Importante: Al servicio de Tokens no le importa la fuente de las coins
// De eso se encarga el repositorio que interactua con la DB

export class CoinsService<
  TProvider extends CoinsProvider,
  TRepository extends CoinsRepository,
> {
  private coinsRepository: TRepository;
  private coinsProvider: TProvider;

  constructor(repository: TRepository, provider: TProvider) {
    this.coinsRepository = repository;
    this.coinsProvider = provider;
  }

  /** Devuelve todas las [Coin]s disponibles */
  public async listAllCoins(): Promise<SavedCoin[]> {
    return await this.coinsRepository.getAllCoins();
  }

  /** Devuelve una [Coin] por id */
  public async getCoinById(id: number): Promise<SavedCoin | undefined> {
    return await this.coinsRepository.getCoinById(id);
  }

  /** Devuelve una [Coin] por su nombre */
  public async getCoinByName(
    coin_name: string,
  ): Promise<SavedCoin | undefined> {
    return await this.coinsRepository.getCoinByName(coin_name);
  }

  /** Devuelve una [Coin] por su contract address */
  public async getCoinByAddress(
    coin_address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedCoin> {
    const coin = await this.coinsRepository.getCoinByAddress(
      coin_address,
      blockchain,
    );
    // Si la [Coin] ya esta guardada la devuelvo, actualizando la market data antes
    if (coin) {
      const market_data = await this.coinsProvider.getCoinMarketData(coin.name);
      await this.coinsRepository.saveMarketData([market_data]);
      return coin;
    }

    const newCoin = await this.coinsProvider.getCoinByAddress(
      coin_address,
      blockchain,
    );
    const [savedCoin] = await this.coinsRepository.saveCoins([newCoin]);
    // Se que no es undefined porque le pase solo un elemento y estoy agarrando el primero
    return savedCoin!;
  }

  /** Devuelve una [NFT] por su contract_address y token_id */
  public async getNFTByAddress(
    blockchain: BlockchainsName,
    contract_address: string,
    token_id: number,
  ): Promise<SavedNFT> {
    const saved_nft = await this.coinsRepository.getNFTByAddress(
      contract_address,
      token_id,
      blockchain,
    );
    return saved_nft;
  }

  public async getCoinsByBlockchain(
    blockchain: string,
    page_number: number,
    page_size: number,
    name_search: string | undefined,
  ): Promise<SavedCoin[]> {
    const coinsData = await this.coinsRepository.getCoinsByBlockchain(
      blockchain,
      page_number,
      page_size,
    );
    if (name_search) {
      const coinsFuse = new Fuse(coinsData, { keys: ["name"] });

      return coinsFuse.search(name_search).map((f) => f.item);
    }
    return coinsData;
  }

  /** Guarda las [Coin]s mas recientes */
  public async saveLatestCoins(): Promise<SavedCoin[]> {
    const latestCoins = await this.coinsProvider.getLatestCoins(
      Object.keys(blockchains),
      100_000,
    );
    const savedCoins = await this.coinsRepository.saveCoins(latestCoins);
    return savedCoins;
  }

  /** Guardo todas las [Coin]s disponibles */
  public async saveAllCoins(): Promise<SavedCoin[]> {
    // Pido coins con capitalizacion mayor a 100_000 USD
    const allCoins = await this.coinsProvider.getAllCoins(100_000);
    const savedCoins = await this.coinsRepository.saveCoins(allCoins);
    return savedCoins;
  }

  /** Devuelve todas las [Candle]s guardadas segun el rango */
  public async getCandlesByDate(
    frequency: "daily" | "hourly",
    coin_id: number,
    from_date?: Date,
    to_date?: Date,
  ): Promise<Candle[] | undefined> {
    const from = from_date
      ? from_date
      : frequency === "daily"
        ? moment().subtract(1, "month").toDate()
        : moment().subtract(1, "day").toDate();
    const to = to_date ? to_date : moment().add(1, "minute").toDate();

    return await this.coinsRepository.getCandles(frequency, coin_id, from, to);
  }

  /** Guarda las ultimas [Candle] mas recientes segun la frecuencia y la tasa de refresco (cada cuanto se guarda) */
  public async saveCandles(
    coin_id: number,
    frequency: "hourly" | "daily",
    refresh_rate: number,
  ) {
    const savedCoin = await this.coinsRepository.getCoinById(coin_id);
    if (!savedCoin) {
      return undefined;
    }
    const candles = await this.coinsProvider.getCandleData(
      frequency,
      savedCoin.name,
      refresh_rate,
    );
    await this.coinsRepository.saveCandles(
      candles.map((c) => ({ coin_id, ...c })),
    );
  }

  /** Actualiza los datos de mercado relacionados a las coins, para todas las coins disponibles */
  public async updateMarketData(): Promise<void> {
    const market_data = await this.coinsProvider.getAllCoinMarketData();
    await this.coinsRepository.saveMarketData(market_data);
  }

  public async searchCoinsByName(name_search: string): Promise<SavedCoin[]> {
    const coinsData = await this.coinsRepository.getAllCoins();
    const coinsFuse = new Fuse(coinsData, { keys: ["name"], threshold: 0.25 });

    return coinsFuse.search(name_search).map((f) => f.item);
  }
}
