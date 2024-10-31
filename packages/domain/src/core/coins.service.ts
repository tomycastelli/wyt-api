import Fuse from "fuse.js";
import type { Candle, Coin, SavedCoin, SavedNFT } from "./coins.entities.js";
import type { CoinsProvider, CoinsRepository } from "./coins.ports.js";
import {
  type BlockchainCoin,
  type BlockchainsName,
  EveryBlockainsName,
  base_coins,
  generateFilledDateRange,
} from "./vars.js";

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

  private global_minimum_market_cap = 1_000_000;

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

    if (not_found.length > 0) {
      const newCoins = await this.coinsProvider.getCoinsByAddress(
        not_found,
        blockchain,
      );

      const new_saved_coins = await this.coinsRepository.saveCoins(newCoins);

      saved_coins.push(
        ...new_saved_coins.map((saved_coin) => ({ saved_coin, is_new: false })),
      );
    }

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
    ids: number[] | undefined,
    name_search: string | undefined,
  ): Promise<SavedCoin[]> {
    const coinsData = await this.coinsRepository.getCoinsByBlockchain(
      blockchain,
      page_number,
      name_search ? 1_000_000 : page_size,
      ids,
    );
    if (name_search) {
      const coinsFuse = new Fuse(coinsData, { keys: ["name"] });

      return coinsFuse
        .search(name_search)
        .map((f) => f.item)
        .slice((page_number - 1) * page_size, page_number * page_size);
    }
    return coinsData;
  }

  /** Guarda las [Coin]s mas recientes */
  public async saveLatestCoins(): Promise<SavedCoin[]> {
    const latestCoins = await this.coinsProvider.getLatestCoins(
      this.global_minimum_market_cap,
    );

    const savedCoins = await this.coinsRepository.saveCoins(latestCoins);
    return savedCoins;
  }

  /** Guarda todas las [Coin]s disponibles en el proveedor */
  public async saveAllCoins(): Promise<SavedCoin[]> {
    const coin_list = await this.coinsProvider.getAllCoins();

    // Todas las [SavedCoin]s
    const saved_coins_names = await this.coinsRepository
      .getAllCoins(this.global_minimum_market_cap)
      .then((coin) => coin.map((c) => c.name));

    // Se filtran los tokens que esten dentro de las blockchains que nos interesan y aparte no estén ya guardadas
    const blockchain_coins = coin_list.filter(
      (coin) =>
        (!saved_coins_names.includes(coin.name) &&
          base_coins.includes(coin.name as BlockchainCoin)) ||
        Object.keys(coin.platforms).some((platform) =>
          EveryBlockainsName.includes(platform as BlockchainsName),
        ),
    );

    if (blockchain_coins.length === 0) return [];

    // Consigo su market_cap de a baches
    const filtered_market_caps = await this.coinsProvider.getAllCoinMarketData(
      blockchain_coins.map((f) => f.name),
    );

    // Filtrado último
    const filtered_list = blockchain_coins.filter(
      (bc) =>
        filtered_market_caps.find((fmc) => fmc.name === bc.name)?.market_cap ??
        0 >= this.global_minimum_market_cap,
    );

    const coins_to_save: Coin[] = [];

    for (const coin of filtered_list) {
      const coin_to_save = await this.coinsProvider.getCoinDetails(
        coin,
        this.global_minimum_market_cap,
      );
      if (coin_to_save) {
        coins_to_save.push(coin_to_save);
      }
    }

    const saved_coins = await this.coinsRepository.saveCoins(coins_to_save);

    return saved_coins;
  }

  /** Devuelve todas las [Candle]s guardadas segun el rango. */
  public async getCandlesByDate(
    frequency: "daily" | "hourly",
    coin_id: number,
    from_date: Date,
    to_date: Date,
  ): Promise<Candle[]> {
    const expected_timestamps = generateFilledDateRange(
      from_date,
      to_date,
      frequency,
    );

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
    coin_ids: number[],
    timestamps: Date[],
  ): Promise<Candle[]> {
    const candles = await this.coinsRepository.getCandlesByDateList(
      frequency,
      coin_ids,
      timestamps,
    );

    const all_candles: Candle[] = [];

    // Para cada [Coin] me fijo si estan todos los timestamps
    for (const coin_id of coin_ids) {
      const coin_candles = candles.filter((c) => c.coin_id === coin_id);
      const candle_timestamps = coin_candles.map((c) => c.timestamp.getTime());

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

        const total_candles = [
          ...coin_candles.filter((c) => c.coin_id),
          ...filtered_new_candles,
        ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        all_candles.push(...total_candles);
      }

      // Ya el repositorio tiene todas las candelas requeridas
      all_candles.push(...candles);
    }

    return all_candles;
  }

  /** Actualiza todos los datos relacionados a las [Coin]s */
  /// !! Revisar esto que no se si estaría andando bien.
  /// De todas formas: me parece que implementar web scraping sea lo mas óptimo para tener los datos actualizados
  public async updateCoinsByMarketcap(
    importance_level: 1 | 2 | 3,
  ): Promise<SavedCoin[]> {
    let minimum_market_cap = 0;
    let maximum_market_cap: undefined | number = undefined;

    const importat_market_cap = this.global_minimum_market_cap * 5;
    // Vamos a definir que las importantes son 5 veces el minimum market_cap
    // Las medianas son el minimum market cap hasta el

    switch (importance_level) {
      case 1: {
        minimum_market_cap = importat_market_cap;
        maximum_market_cap = undefined;
        break;
      }
      case 2: {
        minimum_market_cap = this.global_minimum_market_cap;
        maximum_market_cap = importat_market_cap;
        break;
      }
      case 3: {
        minimum_market_cap = 0;
        maximum_market_cap = this.global_minimum_market_cap;
        break;
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

    return coins;
  }

  public async searchCoinsByName(name_search: string): Promise<SavedCoin[]> {
    const coinsData = await this.coinsRepository.getAllCoins(0);
    const coinsFuse = new Fuse(coinsData, { keys: ["name"], threshold: 0.25 });

    return coinsFuse.search(name_search).map((f) => f.item);
  }
}
