import {
  type BlockchainsName,
  type Candle,
  type Coin,
  type CoinMarketData,
  type CoinsProvider,
  EveryBlockainsName,
  chunkArray,
} from "@repo/domain";
import { type } from "arktype";
import { RateLimiter } from "./ratelimiter.js";

const coinsResponseSchema = type({
  id: "string",
  symbol: "string",
  name: "string",
  platforms: "Record<string, string>",
}).array();

const latestCoinsResponseSchema = type({
  id: "string",
  symbol: "string",
  name: "string",
  "+": "delete",
}).array();

const coinDetailsSchema = type({
  "description?": { en: "string", "+": "delete" },
  "image?": { large: "string", "+": "delete" },
  detail_platforms: type.Record("string", {
    decimal_place: "number|null",
    contract_address: "string|null",
  }),
  "market_data?": {
    "current_price?": {
      "usd?": "number",
      "+": "delete",
    },
    market_cap: {
      "usd?": "number",
      "+": "delete",
    },
    ath: {
      "usd?": "number",
      "+": "delete",
    },
    price_change_percentage_24h: "number|null",
    price_change_24h: "number|null",
    "+": "delete",
  },
  "+": "delete",
});

const marketDataListSchema = type({
  id: "string",
  current_price: "number|null",
  market_cap: "number|null",
  price_change_percentage_24h: "number|null",
  price_change_24h: "number|null",
  ath: "number|null",
  "+": "delete",
});

const candlesResponseSchema = type([
  "number",
  "number",
  "number",
  "number",
  "number",
]).array();

const tokenDataByAddressSchema = type({
  data: type({
    attributes: {
      symbol: "string",
      coingecko_coin_id: "string|null",
      "+": "delete",
    },
    "+": "delete",
  }).array(),
});

export class CoinGecko implements CoinsProvider {
  private base_url = "https://pro-api.coingecko.com/api/v3";

  private blockchains_categories = [
    "ethereum-ecosystem",
    "solana-ecosystem",
    "avalanche-ecosystem",
    "polygon-ecosystem",
  ];

  private blockchains_to_networks_mapper: Record<BlockchainsName, string> = {
    "binance-smart-chain": "bsc",
    "polygon-pos": "polygon_pos",
    ethereum: "eth",
    avalanche: "avax",
    bitcoin: "",
    solana: "solana",
  };

  // Por ahora cada instancia de CoinGecko va a tener 150 req/min
  private rate_limiter: RateLimiter = new RateLimiter(150, 60);

  private request_data: RequestInit;

  constructor(api_key: string) {
    this.request_data = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-cg-pro-api-key": api_key,
      },
    };
  }

  async rateLimitedCallApi(url: string): Promise<unknown | null> {
    const retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        await this.rate_limiter.acquire();
        const response = await fetch(url, this.request_data);
        if (!response.ok) {
          throw Error(`Invalid request: ${JSON.stringify(response)}`);
        }

        const json = await response.json();

        return json;
      } catch (_e) {
        if (i === retries - i) {
          return null;
        }
      }
    }
  }

  async getAllCoins(): Promise<
    {
      id: string;
      symbol: string;
      name: string;
      platforms: Record<string, string>;
    }[]
  > {
    const list = await this.rateLimitedCallApi(
      `${this.base_url}/coins/list?include_platform=true`,
    );

    const parsed_list = coinsResponseSchema(list);

    if (parsed_list instanceof type.errors) {
      throw parsed_list;
    }

    return parsed_list;
  }

  async getCoinDetails(
    coin: {
      id: string;
      symbol: string;
      platforms: Record<string, string>;
    },
    minimum_market_cap: number,
  ): Promise<Coin | null> {
    // Para cada token se consulta el resto de info:
    // 'descripcion', 'image_url', 'market_data'
    const response = await this.rateLimitedCallApi(
      `${this.base_url}/coins/${coin.id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
    );

    if (!response) {
      return null;
    }

    const parsedCoinDetails = coinDetailsSchema(response);

    if (parsedCoinDetails instanceof type.errors) {
      console.error("Failed to parse coinDetails: ", response);
      throw parsedCoinDetails;
    }

    if (
      parsedCoinDetails.description &&
      parsedCoinDetails.image &&
      parsedCoinDetails.market_data &&
      parsedCoinDetails.market_data.current_price?.usd &&
      parsedCoinDetails.market_data.ath?.usd &&
      parsedCoinDetails.market_data.price_change_percentage_24h &&
      parsedCoinDetails.market_data.price_change_24h &&
      (parsedCoinDetails.market_data.market_cap?.usd ?? 0) >= minimum_market_cap
    ) {
      return {
        name: coin.id,
        symbol: coin.symbol,
        provider: "coingecko",
        description: parsedCoinDetails.description!.en,
        ath: parsedCoinDetails.market_data!.ath.usd!,
        image_url: parsedCoinDetails.image!.large,
        market_cap: parsedCoinDetails.market_data!.market_cap.usd!,
        price: parsedCoinDetails.market_data!.current_price!.usd!,
        price_change_percentage_24h:
          parsedCoinDetails.market_data!.price_change_percentage_24h!,
        price_change_24h: parsedCoinDetails.market_data!.price_change_24h!,
        // Me quedo con solo los contratos que me interesan
        contracts: Object.entries(parsedCoinDetails.detail_platforms)
          .filter(([key]) =>
            EveryBlockainsName.includes(key as BlockchainsName),
          )
          .map(([blockchain, detail]) => ({
            blockchain: blockchain as BlockchainsName,
            contract_address: detail.contract_address!,
            decimal_place: detail.decimal_place!,
          })),
      };
    }

    return null;
  }

  async getCandleData(
    frequency: "hourly" | "daily",
    coin_name: string,
    refresh_rate: number,
  ): Promise<Omit<Candle, "coin_id">[]> {
    // Si es diario, quiero solo la ultima hora
    // Los datos estan disponibles 35 minutos despues
    // Minimo llamar a los 36 minutos para asegurarse tener la candela

    // Pido los dias minimos para satisfacer el intervalo
    const minimumDays =
      frequency === "hourly" ? Math.ceil(refresh_rate / 24) : refresh_rate;

    // La API acepta estos numeros
    const acceptedDays = [1, 7, 14, 30, 90].filter((d) => d >= minimumDays);
    const daysToFetch = acceptedDays.length > 0 ? Math.min(...acceptedDays) : 1;

    const candles = await this.rateLimitedCallApi(
      `${this.base_url}/coins/${coin_name}/ohlc?vs_currency=usd&days=${daysToFetch}&precision=18&interval=${frequency}`,
    );

    if (!candles) {
      return [];
    }

    const parsedCandles = candlesResponseSchema(candles);

    if (parsedCandles instanceof type.errors) {
      console.error("Failed to parse candles: ", candles);
      throw parsedCandles;
    }

    // Segun la frecuencia, agarro las ultimas velas
    const mappedCandles = parsedCandles.slice(-refresh_rate).map((c) => ({
      frequency,
      timestamp: new Date(c[0]),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
    }));

    return mappedCandles;
  }

  async getLatestCoins(minimum_market_cap: number): Promise<Coin[]> {
    const latestCoins = await this.rateLimitedCallApi(
      `${this.base_url}/coins/list/new`,
    );

    const parsedLatestCoins = latestCoinsResponseSchema(latestCoins);

    if (parsedLatestCoins instanceof type.errors) {
      console.error("Failed to parse latestCoins: ", latestCoins);
      throw parsedLatestCoins;
    }

    // Para cada token se consulta el resto de info:
    // 'descripcion', 'image_url', 'market_data'
    const detailsListPromises = parsedLatestCoins.map(async (coin) => {
      const coinDetails = await this.rateLimitedCallApi(
        `${this.base_url}/coins/${coin.id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
      );

      const parsedCoinDetails = coinDetailsSchema.merge({
        platforms: "Record<string, string|null>",
      })(coinDetails);

      if (parsedCoinDetails instanceof type.errors) {
        console.error(
          "Failed to parse coinDetails in latestCoins: ",
          coinDetails,
        );
        throw parsedCoinDetails;
      }

      return { ...parsedCoinDetails, ...coin };
    });

    const coinDetails = await Promise.all(detailsListPromises);

    const mappedCoinDetails: Coin[] = coinDetails
      .filter(
        (coin) =>
          coin.description &&
          coin.image &&
          coin.market_data &&
          coin.market_data.current_price?.usd &&
          coin.market_data.ath?.usd &&
          coin.market_data.price_change_percentage_24h &&
          coin.market_data.price_change_24h &&
          Object.keys(coin.platforms).some((platform) =>
            EveryBlockainsName.includes(platform as BlockchainsName),
          ) &&
          (coin.market_data.market_cap?.usd ?? 0) >= minimum_market_cap,
      )
      .map((coin) => ({
        name: coin.id,
        symbol: coin.symbol,
        provider: "coingecko",
        description: coin.description!.en,
        ath: coin.market_data!.ath.usd!,
        image_url: coin.image!.large,
        market_cap: coin.market_data!.market_cap.usd!,
        price: coin.market_data!.current_price!.usd!,
        price_change_percentage_24h:
          coin.market_data!.price_change_percentage_24h!,
        price_change_24h: coin.market_data!.price_change_24h!,
        // Me quedo con solo los contratos que me interesan
        contracts: Object.entries(coin.detail_platforms)
          .filter(([key]) =>
            EveryBlockainsName.includes(key as BlockchainsName),
          )
          .map(([blockchain, detail]) => ({
            blockchain: blockchain as BlockchainsName,
            contract_address: detail.contract_address!,
            decimal_place: detail.decimal_place!,
          })),
      }));

    return mappedCoinDetails;
  }

  async getCoinsByAddress(
    coin_address: string[],
    blockchain: BlockchainsName,
  ): Promise<Coin[]> {
    if (coin_address.length === 0) return [];

    const coins_to_return: Coin[] = [];
    // Se pueden hasta 30 contract addresses por api call
    const chunks = chunkArray(coin_address, 30);
    for (const address_chunk of chunks) {
      const coinData = await this.rateLimitedCallApi(
        `${this.base_url}/onchain/networks/${this.blockchains_to_networks_mapper[blockchain]}/tokens/multi/${address_chunk.join(",")}`,
      );

      const parsedCoinData = tokenDataByAddressSchema(coinData);

      if (parsedCoinData instanceof type.errors) {
        console.error("Failed to parse coinsByAddress: ", coinData);
        console.log(
          `${this.base_url}/onchain/networks/${this.blockchains_to_networks_mapper[blockchain]}/tokens/multi/${address_chunk.join(",")}`,
        );
        throw parsedCoinData;
      }

      const coins_data = parsedCoinData.data;

      for (const coin_data of coins_data
        .filter((c) => c.attributes.coingecko_coin_id)
        .map((a) => a.attributes)) {
        const coinDetails = await this.rateLimitedCallApi(
          `${this.base_url}/coins/${coin_data.coingecko_coin_id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
        );

        const parsedCoinDetails = coinDetailsSchema.merge({
          platforms: "Record<string, string|null>",
        })(coinDetails);

        if (parsedCoinDetails instanceof type.errors) {
          console.error(
            "Failed to parse coinDetails in coinsByAddress: ",
            coinDetails,
          );
          continue;
        }

        if (
          parsedCoinDetails.description &&
          parsedCoinDetails.image &&
          parsedCoinDetails.market_data &&
          parsedCoinDetails.market_data.current_price?.usd &&
          parsedCoinDetails.market_data.ath?.usd &&
          parsedCoinDetails.market_data.price_change_percentage_24h &&
          parsedCoinDetails.market_data.price_change_24h &&
          Object.keys(parsedCoinDetails.platforms).some((platform) =>
            EveryBlockainsName.includes(platform as BlockchainsName),
          )
        ) {
          const mappedCoinDetails: Coin = {
            name: coin_data.coingecko_coin_id!,
            symbol: coin_data.symbol,
            provider: "coingecko",
            description: parsedCoinDetails.description?.en ?? null,
            ath: parsedCoinDetails.market_data!.ath.usd!,
            image_url: parsedCoinDetails.image!.large,
            market_cap: parsedCoinDetails.market_data!.market_cap.usd!,
            price: parsedCoinDetails.market_data!.current_price!.usd!,
            price_change_percentage_24h:
              parsedCoinDetails.market_data!.price_change_percentage_24h!,
            price_change_24h: parsedCoinDetails.market_data!.price_change_24h!,
            // Me quedo con solo los contratos que me interesan
            contracts: Object.entries(parsedCoinDetails.detail_platforms)
              .filter(([key]) =>
                EveryBlockainsName.includes(key as BlockchainsName),
              )
              .map(([blockchain, detail]) => ({
                blockchain: blockchain as BlockchainsName,
                contract_address: detail.contract_address!,
                decimal_place: detail.decimal_place!,
              })),
          };

          coins_to_return.push(mappedCoinDetails);
        }
      }
    }

    return coins_to_return;
  }

  async getAllCoinMarketData(coin_names?: string[]): Promise<CoinMarketData[]> {
    const market_data_array: CoinMarketData[] = [];
    if (!coin_names) {
      // Vamos a ir haciendo requests por categoria
      for (const category of this.blockchains_categories) {
        let is_last_page = false;
        let page = 1;
        while (!is_last_page) {
          const marketData = await this.rateLimitedCallApi(
            `${this.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&price_change_percentage=24h&locale=en&precision=18&category=${category}&page=${page}`,
          );

          if (!marketData) {
            console.error(
              `Failed to fetch CoinGecko data from: ${this.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&price_change_percentage=24h&locale=en&precision=18&category=${category}&page=${page}`,
            );
            return [];
          }

          const parsedMarketData = marketDataListSchema.array()(marketData);

          if (parsedMarketData instanceof type.errors) {
            console.error("Failed to parse all coin market data: ", marketData);
            throw parsedMarketData;
          }

          if (parsedMarketData.length < 250) {
            // Termino el loop con esta iteracion
            is_last_page = true;
          }

          const mappedMarketData: CoinMarketData[] = parsedMarketData
            .filter(
              (md) =>
                md.price_change_24h &&
                md.market_cap &&
                md.ath &&
                md.current_price &&
                md.price_change_percentage_24h,
            )
            .map((md) => ({
              name: md.id,
              price: md.current_price!,
              ath: md.ath!,
              market_cap: md.market_cap!,
              price_change_24h: md.price_change_24h!,
              price_change_percentage_24h: md.price_change_percentage_24h!,
            }));

          page++;

          market_data_array.push(...mappedMarketData);
        }
      }
    } else {
      // Reparto en chunks de 250 coin names y hago la query
      const chunk_size = 250;
      let index_cursor = 0;
      let is_last_page = false;
      while (!is_last_page) {
        const coins_to_fetch = coin_names.slice(
          index_cursor,
          index_cursor + chunk_size,
        );

        const marketData = await this.rateLimitedCallApi(
          `${this.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&price_change_percentage=24h&locale=en&precision=18&ids=${coins_to_fetch.join(",")}`,
        );

        const parsedMarketData = marketDataListSchema.array()(marketData);

        if (parsedMarketData instanceof type.errors) throw parsedMarketData;

        if (parsedMarketData.length < chunk_size) {
          // Termino el loop con esta iteracion
          is_last_page = true;
        }

        index_cursor += chunk_size;

        const mappedMarketData: CoinMarketData[] = parsedMarketData
          .filter(
            (md) =>
              md.price_change_24h &&
              md.market_cap &&
              md.ath &&
              md.current_price &&
              md.price_change_percentage_24h,
          )
          .map((md) => ({
            name: md.id,
            price: md.current_price!,
            ath: md.ath!,
            market_cap: md.market_cap!,
            price_change_24h: md.price_change_24h!,
            price_change_percentage_24h: md.price_change_percentage_24h!,
          }));

        market_data_array.push(...mappedMarketData);
      }
    }

    return market_data_array;
  }

  async getCoinMarketData(coin_name: string): Promise<CoinMarketData> {
    const coinDetails = await this.rateLimitedCallApi(
      `${this.base_url}/coins/${coin_name}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
    );

    const parsedCoinDetails = coinDetailsSchema(coinDetails);

    if (parsedCoinDetails instanceof type.errors) throw parsedCoinDetails;

    const market_data = parsedCoinDetails.market_data;

    if (
      !market_data ||
      market_data.ath.usd === undefined ||
      market_data.ath.usd === null ||
      market_data.current_price?.usd === undefined ||
      market_data.current_price?.usd === null ||
      market_data.market_cap.usd === undefined ||
      market_data.market_cap.usd === null ||
      market_data.price_change_24h === undefined ||
      market_data.price_change_24h === null ||
      market_data.price_change_percentage_24h === undefined ||
      market_data.price_change_percentage_24h === null
    )
      throw Error("Unavailable market data: ", {
        cause: `Got this response: ${JSON.stringify(parsedCoinDetails)}`,
      });

    // Asumo que como es una [Coin] que ya tenemos, va a haber Market data disponible
    const coin_market_data: CoinMarketData = {
      name: coin_name,
      ath: market_data.ath.usd,
      market_cap: market_data.market_cap.usd,
      price: market_data.current_price.usd,
      price_change_24h: market_data.price_change_24h,
      price_change_percentage_24h: market_data.price_change_percentage_24h,
    };

    return coin_market_data;
  }

  async getCandlesByDateRange(
    frequency: "hourly" | "daily",
    coin_name: string,
    from_date: Date,
    to_date: Date,
  ): Promise<Omit<Candle, "coin_id">[]> {
    const candles = await this.rateLimitedCallApi(
      `${this.base_url}/coins/${coin_name}/ohlc/range?vs_currency=usd&interval=${frequency}&from=${Math.floor(from_date.getTime() / 1000)}&to=${Math.floor(to_date.getTime() / 1000)}`,
    );

    const parsedCandles = candlesResponseSchema(candles);

    if (parsedCandles instanceof type.errors) throw parsedCandles;

    const mapped_candles = parsedCandles.map((c) => ({
      frequency,
      timestamp: new Date(c[0]),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
    }));

    return mapped_candles;
  }
}
