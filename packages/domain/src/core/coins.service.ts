import Fuse from "fuse.js";
import type { Candle, SavedCoin, SavedNFT } from "./coins.entities.js";
import type { CoinsProvider, CoinsRepository } from "./coins.ports.js";
import type { BlockchainsName } from "./vars.js";

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
  public async getCoinsByAddress(
    coin_address: string[],
    blockchain: BlockchainsName,
  ): Promise<{ saved_coin: SavedCoin; is_new: boolean }[]> {
    const saved_coins: { saved_coin: SavedCoin; is_new: boolean }[] = [];
    const not_found: string[] = [];

    const address_set = new Set(coin_address);

    for (const address of address_set) {
      const saved_coin = await this.coinsRepository.getCoinByAddress(
        address,
        blockchain,
      );

      if (saved_coin) {
        saved_coins.push({ saved_coin, is_new: false });
      } else {
        not_found.push(address);
      }
    }

    const newCoins = await this.coinsProvider.getCoinsByAddresses(
      not_found,
      blockchain,
    );

    const new_saved_coins = await this.coinsRepository.saveCoins(newCoins);

    saved_coins.push(
      ...new_saved_coins.map((saved_coin) => ({ saved_coin, is_new: false })),
    );

    return saved_coins;
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
    const latestCoins = await this.coinsProvider.getLatestCoins(100_000);
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

  /** Devuelve todas las [Candle]s guardadas segun el rango. */
  public async getCandlesByDate(
    frequency: "daily" | "hourly",
    coin_id: number,
    from_date: Date,
    to_date: Date,
  ): Promise<Candle[]> {
    if (to_date > new Date())
      throw Error(`To date is bigger than now!. to_date: ${to_date}`);

    const expected_timestamps: number[] = [];
    const current_date = new Date(from_date);

    if (frequency === "daily") {
      while (current_date <= to_date) {
        expected_timestamps.push(new Date(current_date).getTime());
        current_date.setDate(current_date.getDate() + 1);
      }
    } else if (frequency === "hourly") {
      while (current_date <= to_date) {
        expected_timestamps.push(new Date(current_date).getTime());
        current_date.setHours(current_date.getHours() + 1);
      }
    }

    // Las busco en el repo
    const candles = await this.coinsRepository.getCandlesByDateRange(
      frequency,
      coin_id,
      from_date,
      to_date,
    );

    const candle_timestamps = candles.map((c) => c.timestamp.getTime());

    const missing_timestamps = expected_timestamps.filter(
      (et) => !candle_timestamps.includes(et),
    );

    if (missing_timestamps.length > 0) {
      const coin = await this.coinsRepository.getCoinById(coin_id);
      if (!coin) return [];
      // Se las paso al proveedor
      const new_candles = await this.coinsProvider.getCandlesByDateRange(
        frequency,
        coin.name,
        new Date(Math.min(...missing_timestamps)),
        new Date(Math.max(...missing_timestamps)),
      );

      // Puede ser que haya traido de más, asi que me fijo de descartar esas
      const filtered_new_candles = new_candles
        .filter((c) => !candle_timestamps.includes(c.timestamp.getTime()))
        .map((c) => ({ ...c, coin_id }));

      // Las guardo
      await this.coinsRepository.saveCandles(filtered_new_candles);

      const total_candles = [...candles, ...filtered_new_candles].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );

      return total_candles;
    }

    // Ya el repositorio tiene todas las candelas requeridas
    return candles;
  }

  /** Devuelve las candelas segun la lista de fechas dadas */
  public async getCandlesByDateList(
    frequency: "daily" | "hourly",
    coin_id: number,
    timestamps: Date[],
  ): Promise<Candle[]> {
    const candles = await this.coinsRepository.getCandlesByDateList(
      frequency,
      coin_id,
      timestamps,
    );

    const candle_timestamps = candles.map((c) => c.timestamp.getTime());

    const missing_timestamps = timestamps
      .filter((t) => !candle_timestamps.includes(t.getTime()))
      .map((t) => t.getTime());

    if (missing_timestamps.length > 0) {
      const coin = await this.coinsRepository.getCoinById(coin_id);
      if (!coin) return [];
      // Se las paso al proveedor
      const new_candles = await this.coinsProvider.getCandlesByDateRange(
        frequency,
        coin.name,
        new Date(Math.min(...missing_timestamps)),
        new Date(Math.max(...missing_timestamps)),
      );

      // Puede ser que haya traido de más, asi que me fijo de descartar esas
      const filtered_new_candles = new_candles
        .filter((c) => !candle_timestamps.includes(c.timestamp.getTime()))
        .map((c) => ({ ...c, coin_id }));

      // Las guardo
      await this.coinsRepository.saveCandles(filtered_new_candles);

      const total_candles = [...candles, ...filtered_new_candles].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );

      return total_candles;
    }

    // Ya el repositorio tiene todas las candelas requeridas
    return candles;
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
      // Vamos a darle un espaciado a las requests
      await this.saveCandles(coin.id, frequency, refresh_rate);
    }

    return coins;
  }

  /** Guarda las ultimas [Candle] mas recientes segun la frecuencia y la tasa de refresco (cada cuanto se guarda) */
  private async saveCandles(
    coin_id: number,
    frequency: "hourly" | "daily",
    refresh_rate: number,
  ): Promise<void> {
    const savedCoin = await this.coinsRepository.getCoinById(coin_id);
    if (!savedCoin) {
      return;
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
