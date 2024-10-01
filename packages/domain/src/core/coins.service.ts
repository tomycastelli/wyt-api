import Fuse from "fuse.js";
import moment from "moment";
import type { Candle, SavedCoin, SavedNFT } from "./coins.entities";
import type { CoinsProvider, CoinsRepository } from "./coins.ports";
import { type BlockchainsName, base_coins, blockchains } from "./vars";

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
    const coin = await this.coinsRepository.getCoinById(id);

    if (!coin) return undefined;

    return await this.updatedCoin(coin);
  }

  /** Devuelve una [Coin] por su nombre */
  public async getCoinByName(
    coin_name: string,
  ): Promise<SavedCoin | undefined> {
    const coin = await this.coinsRepository.getCoinByName(coin_name);

    if (!coin) return undefined;

    return await this.updatedCoin(coin);
  }

  /** Devuelve una [Coin] por su contract address */
  public async getCoinByAddress(
    coin_address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedCoin | null> {
    const coin = await this.coinsRepository.getCoinByAddress(
      coin_address,
      blockchain,
    );

    // Si la [Coin] ya esta guardada la devuelvo, actualizando la market data antes
    if (coin) {
      return await this.updatedCoin(coin);
    }

    const newCoin = await this.coinsProvider.getCoinByAddress(
      coin_address,
      blockchain,
    );
    // Si no está en el proveedor
    if (!newCoin) return null;

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

  public async getCoinHistorialCandles(
    frequency: "hourly" | "daily",
    coin_name: string,
  ): Promise<void> {
    try {
      const coin = await this.getCoinByName(coin_name);
      if (!coin) return;

      let date_cursor = Math.floor(Date.now() / 1000);
      let is_oldest_page = false;

      // Hourly: Up to 744 hourly interval candles per req
      // Daily: Up to 180 daily interval candles per req
      // Earliest date: 9 February 2018 (1518147224 epoch time)

      while (!is_oldest_page) {
        const { candles, date_cursor: new_date_cursor } =
          await this.coinsProvider.getCoinHistorialCandles(
            frequency,
            coin_name,
            date_cursor,
          );

        await this.coinsRepository.saveCandles(
          candles.map((c) => ({ ...c, coin_id: coin.id })),
        );

        date_cursor = new_date_cursor;

        if (
          (frequency === "hourly"
            ? candles.length < 744
            : candles.length < 180) ||
          date_cursor < 1518147224
        ) {
          is_oldest_page = true;
        }
      }
    } catch (e) {
      console.error(e);
    }
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

  // Helper
  async updatedCoin(saved_coin: SavedCoin): Promise<SavedCoin> {
    const market_data = await this.coinsProvider.getCoinMarketData(
      saved_coin.name,
    );
    await this.coinsRepository.saveMarketData([market_data]);
    return { ...saved_coin, ...market_data };
  }
}
