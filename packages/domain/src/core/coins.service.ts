import Fuse from "fuse.js";
import moment from "moment";
import type { Candle, SavedCoin, SavedNFT } from "./coins.entities.js";
import type { CoinsProvider, CoinsRepository } from "./coins.ports.js";
import { type BlockchainsName, base_coins, blockchains } from "./vars.js";

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

  private global_minimum_market_cap = 10_000;

  constructor(repository: TRepository, provider: TProvider) {
    this.coinsRepository = repository;
    this.coinsProvider = provider;
  }

  /** Devuelve una [Coin] por id */
  public async getCoinById(id: number): Promise<SavedCoin | undefined> {
    const coin = await this.coinsRepository.getCoinById(id);

    if (!coin) return undefined;

    return coin;
  }

  /** Devuelve una [Coin] por su nombre */
  public async getCoinByName(
    coin_name: string,
  ): Promise<SavedCoin | undefined> {
    const coin = await this.coinsRepository.getCoinByName(coin_name);

    if (!coin) return undefined;

    return coin;
  }

  /** Devuelve una [Coin] por su contract address */
  public async getCoinByAddress(
    coin_address: string,
    blockchain: BlockchainsName,
  ): Promise<{ saved_coin: SavedCoin; is_new: boolean } | null> {
    const saved_coin = await this.coinsRepository.getCoinByAddress(
      coin_address,
      blockchain,
    );

    // Si la [Coin] ya esta guardada la devuelvo
    if (saved_coin) {
      return { saved_coin, is_new: false };
    }

    const newCoin = await this.coinsProvider.getCoinByAddress(
      coin_address,
      blockchain,
    );
    // Si no está en el proveedor
    if (!newCoin) return null;

    const [new_coin] = await this.coinsRepository.saveCoins([newCoin]);
    // Se que no es undefined porque le pase solo un elemento y estoy agarrando el primero
    return { saved_coin: new_coin!, is_new: true };
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
    const allCoins = await this.coinsProvider.getAllCoins(
      this.global_minimum_market_cap,
    );
    const savedCoins = await this.coinsRepository.saveCoins(allCoins);
    return savedCoins;
  }

  /** Devuelve todas las [Candle]s guardadas segun el rango. \
  Si no se le pasa fechas:
  - Frecuencia **diaria**: Devuelve el último més
  - Frequencia **horaria**: Devuelve el último día
  */
  public async getCandlesByDate(
    frequency: "daily" | "hourly",
    coin_id: number,
    from_date?: Date,
    to_date?: Date,
  ): Promise<Candle[]> {
    const from = from_date
      ? from_date
      : frequency === "daily"
        ? moment().subtract(1, "month").toDate()
        : moment().subtract(1, "day").toDate();
    const to = to_date ? to_date : moment().add(1, "minute").toDate();

    return await this.coinsRepository.getCandles(frequency, coin_id, from, to);
  }

  public async getCandlesByDateList(
    frequency: "daily" | "hourly",
    coin_id: number,
    timestamps: Date[],
  ): Promise<Candle[]> {
    return await this.coinsRepository.getCandlesByDateList(
      frequency,
      coin_id,
      timestamps,
    );
  }

  public async getCoinHistorialCandles(
    frequency: "hourly" | "daily",
    coin: SavedCoin,
  ): Promise<void> {
    try {
      let date_cursor = Math.floor(Date.now() / 1000);
      let is_oldest_page = false;

      // Hourly: Up to 744 hourly interval candles per req
      // Daily: Up to 180 daily interval candles per req
      // Earliest date: 9 February 2018 (1518147224 epoch time)

      while (!is_oldest_page) {
        const { candles, date_cursor: new_date_cursor } =
          await this.coinsProvider.getCoinHistorialCandles(
            frequency,
            coin.name,
            date_cursor,
          );

        if (candles.length === 0) break;

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

  /** Actualiza todos los datos relacionados a las [Coin]s */
  public async updateCoinsByMarketcap(
    frequency: "hourly" | "daily",
    refresh_rate: number,
  ): Promise<SavedCoin[]> {
    let minimum_market_cap = 0;
    let maximum_market_cap: undefined | number = undefined;

    if (frequency === "daily") {
      if (refresh_rate === 1) {
        // Coins importantes
        minimum_market_cap = 150_000;
        maximum_market_cap = undefined;
      } else if (refresh_rate === 2) {
        // Coins no tan importantes
        minimum_market_cap = 50_000;
        maximum_market_cap = 150_000;
      } else {
        // No son importantes
        minimum_market_cap = 0;
        maximum_market_cap = 50_000;
      }
    } else {
      // Es horario
      if (refresh_rate === 1) {
        // Coins super importantes
        minimum_market_cap = 200_000;
        maximum_market_cap = undefined;
      } else if (refresh_rate === 4) {
        minimum_market_cap = 50_000;
        maximum_market_cap = 200_000;
      } else {
        // No son importantes
        minimum_market_cap = 0;
        maximum_market_cap = 50_000;
      }
    }

    // Vamos a actualizar su market data y luego sus candelas
    const coins = await this.coinsRepository.getAllCoins(
      minimum_market_cap,
      maximum_market_cap,
    );

    // Market data
    const market_data = await this.coinsProvider.getAllCoinMarketData(
      coins.map((c) => c.name),
    );

    await this.coinsRepository.saveMarketData(market_data);

    // Candelas
    for (const coin of coins) {
      await this.saveCandles(coin.id, frequency, refresh_rate);
    }

    return coins;
  }

  /** Guarda las ultimas [Candle] mas recientes segun la frecuencia y la tasa de refresco (cada cuanto se guarda) */
  private async saveCandles(
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

  public async searchCoinsByName(name_search: string): Promise<SavedCoin[]> {
    const coinsData = await this.coinsRepository.getAllCoins(0);
    const coinsFuse = new Fuse(coinsData, { keys: ["name"], threshold: 0.25 });

    return coinsFuse.search(name_search).map((f) => f.item);
  }
}
