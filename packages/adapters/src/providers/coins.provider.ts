import {
	type BlockchainCoin,
	type BlockchainsName,
	type Candle,
	type Coin,
	type CoinMarketData,
	type CoinsProvider,
	EveryBlockainsName,
	NFT,
	base_coins,
} from "@repo/domain";
import { type } from "arktype";
import pLimit, { type LimitFunction } from "p-limit";

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
		contract_address: "string",
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
	current_price: "number",
	market_cap: "number",
	price_change_percentage_24h: "number",
	price_change_24h: "number",
	ath: "number",
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
	data: {
		attributes: {
			symbol: "string",
			coingecko_coin_id: "string",
			description: "string",
			"+": "delete",
		},
		"+": "delete",
	},
});

export class CoinGecko implements CoinsProvider {
	readonly base_url: string = "https://pro-api.coingecko.com/api/v3";

	private readonly blockchains_categories = [
		"ethereum-ecosystem",
		"solana-ecosystem",
		"avalanche-ecosystem",
		"polygon-ecosystem",
	];

	private readonly blockchains_to_networks_mapper: Record<
		BlockchainsName,
		string
	> = {
		"binance-smart-chain": "bsc",
		"polygon-pos": "polygon_pos",
		ethereum: "eth",
		avalanche: "avax",
		bitcoin: "",
		solana: "solana",
	};

	readonly rate_limit: LimitFunction = pLimit(6);

	readonly request_data: RequestInit;

	constructor(api_key: string) {
		this.request_data = {
			method: "GET",
			headers: {
				accept: "application/json",
				"x-cg-pro-api-key": api_key,
			},
		};
	}

	async getAllCoins(minimum_market_cap: number): Promise<Coin[]> {
		const response = await fetch(
			`${this.base_url}/coins/list?include_platform=true`,
			this.request_data,
		).then((res) => res.json());

		const parsedList = coinsResponseSchema(response);

		if (parsedList instanceof type.errors) throw parsedList;

		// Se filtran los tokens que esten dentro de las blockchains que nos interesan
		const filteredList = parsedList.filter((coin) => {
			return base_coins.includes(coin.id as BlockchainCoin);
			// || Object.keys(coin.platforms).some((platform) =>
			//   EveryBlockainsName.includes(platform as BlockchainsName),
			// )
		});

		// Para cada token se consulta el resto de info:
		// 'descripcion', 'image_url', 'market_data'
		const detailsListPromises = filteredList.map((coin) => {
			// Rate limit de 360req/min, menos que el limite de CoinGecko (500)
			// Para darle espacio a otras requests que puedan suceder
			return this.rate_limit(async () => {
				const response = await fetch(
					`
          ${this.base_url}/coins/${coin.id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
					this.request_data,
				).then((res) => res.json());

				const parsedCoinDetails = coinDetailsSchema(response);

				if (parsedCoinDetails instanceof type.errors) throw parsedCoinDetails;

				return { ...parsedCoinDetails, ...coin };
			});
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
						contract_address: detail.contract_address,
						decimal_place: detail.decimal_place!,
					})),
			}));

		return mappedCoinDetails;
	}

	async getCandleData(
		frequency: "hourly" | "daily",
		coin_name: string,
		refresh_rate: number,
	): Promise<Omit<Candle, "coin_id">[]> {
		// Si es diario, quiero solo la ultima hora
		// Los datos estan disponibles 35 minutos despues
		// Minimo llamar a los 36 minutos para asegurarse tener la candela
		const now = new Date();
		if (frequency === "daily" && now.getUTCMinutes() <= 35) {
			throw new Error("Must be called after the 35 minutes of the day");
		}

		// Pido los dias minimos para satisfacer el intervalo
		const minimumDays =
			frequency === "hourly" ? Math.ceil(refresh_rate / 24) : refresh_rate;

		// La API acepta estos numeros
		const acceptedDays = [1, 7, 14, 30, 90].filter((d) => d >= minimumDays);
		const daysToFetch = acceptedDays.length > 0 ? Math.min(...acceptedDays) : 1;

		const response = await fetch(
			`${this.base_url}/coins/${coin_name}/ohlc?vs_currency=usd&days=${daysToFetch}&precision=18&interval=${frequency}`,
			this.request_data,
		).then((res) => res.json());

		const parsedCandles = candlesResponseSchema(response);

		if (parsedCandles instanceof type.errors) throw parsedCandles;

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

	async getLatestCoins(
		blockchains: string[],
		minimum_market_cap: number,
	): Promise<Coin[]> {
		const response = await fetch(
			`${this.base_url}/coins/list/new`,
			this.request_data,
		).then((res) => res.json());

		const parsedLatestCoins = latestCoinsResponseSchema(response);

		if (parsedLatestCoins instanceof type.errors) throw parsedLatestCoins;

		// Para cada token se consulta el resto de info:
		// 'descripcion', 'image_url', 'market_data'
		const detailsListPromises = parsedLatestCoins.map((coin) => {
			// Rate limit de 360req/min, menos que el limite de CoinGecko (500)
			// Para darle espacio a otras requests que puedan suceder
			return this.rate_limit(async () => {
				const response = await fetch(
					`
          ${this.base_url}/coins/${coin.id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
					this.request_data,
				).then((res) => res.json());

				const parsedCoinDetails = coinDetailsSchema.merge({
					platforms: "Record<string, string|null>",
				})(response);

				if (parsedCoinDetails instanceof type.errors) {
					throw parsedCoinDetails;
				}

				return { ...parsedCoinDetails, ...coin };
			});
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
						blockchains.includes(platform),
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
						contract_address: detail.contract_address,
						decimal_place: detail.decimal_place!,
					})),
			}));

		return mappedCoinDetails;
	}

	async getCoinByAddress(
		coin_address: string,
		blockchain: BlockchainsName,
	): Promise<Coin> {
		// Consigo la id de coingecko
		const response = await fetch(
			`${this.base_url}/onchain/networks/${this.blockchains_to_networks_mapper[blockchain]}/tokens/${coin_address}/info`,
			this.request_data,
		);

		const parsedCoinData = tokenDataByAddressSchema(await response.json());

		if (parsedCoinData instanceof type.errors) throw parsedCoinData;

		const coin_data = parsedCoinData.data.attributes;

		const coinDetailsResponse = await fetch(
			`
      ${this.base_url}/coins/${coin_data.coingecko_coin_id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
			this.request_data,
		).then((res) => res.json());

		const parsedCoinDetails = coinDetailsSchema.merge({
			platforms: "Record<string, string|null>",
		})(coinDetailsResponse);

		if (parsedCoinDetails instanceof type.errors) {
			throw parsedCoinDetails;
		}

		const mappedCoinDetails: Coin = {
			name: coin_data.coingecko_coin_id,
			symbol: coin_data.symbol,
			provider: "coingecko",
			description: coin_data.description,
			ath: parsedCoinDetails.market_data!.ath.usd!,
			image_url: parsedCoinDetails.image!.large,
			market_cap: parsedCoinDetails.market_data!.market_cap.usd!,
			price: parsedCoinDetails.market_data!.current_price!.usd!,
			price_change_percentage_24h:
				parsedCoinDetails.market_data!.price_change_percentage_24h!,
			price_change_24h: parsedCoinDetails.market_data!.price_change_24h!,
			// Me quedo con solo los contratos que me interesan
			contracts: Object.entries(parsedCoinDetails.detail_platforms)
				.filter(([key]) => EveryBlockainsName.includes(key as BlockchainsName))
				.map(([blockchain, detail]) => ({
					blockchain: blockchain as BlockchainsName,
					contract_address: detail.contract_address,
					decimal_place: detail.decimal_place!,
				})),
		};

		return mappedCoinDetails;
	}

	async getAllCoinMarketData(): Promise<CoinMarketData[]> {
		const market_data_array: CoinMarketData[] = [];
		// Vamos a ir haciendo requests por categoria
		for (const category of this.blockchains_categories) {
			let is_last_page = false;
			let page = 1;
			while (!is_last_page) {
				const response = await fetch(
					`${this.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&price_change_percentage=24h&locale=en&precision=18&category=${category}&page=${page}`,
					this.request_data,
				).then((res) => res.json());

				page++;

				const parsedMarketData = marketDataListSchema.array()(response);

				if (parsedMarketData instanceof type.errors) throw parsedMarketData;

				if (parsedMarketData.length < 250) {
					// Termino el loop con esta iteracion
					is_last_page = true;
				}

				const mappedMarketData: CoinMarketData[] = parsedMarketData.map(
					(md) => ({
						name: md.id,
						price: md.current_price,
						...md,
					}),
				);

				market_data_array.push(...mappedMarketData);
			}
		}

		return market_data_array;
	}

	async getCoinMarketData(coin_name: string): Promise<CoinMarketData> {
		const response = await fetch(
			`
      ${this.base_url}/coins/${coin_name}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`,
			this.request_data,
		).then((res) => res.json());

		const parsedCoinDetails = coinDetailsSchema(response);

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

	async getAllHistoricalCandles(
		frequency: "hourly" | "daily",
		coin_name: string,
	): Promise<Omit<Candle, "coin_id">[]> {
		const candle_data: Omit<Candle, "coin_id">[] = [];

		// Hourly: Up to 744 hourly interval candles per req
		// Daily: Up to 180 daily interval candles per req
		// Earliest date: 9 February 2018 (1518147224 epoch time)

		// Como muchas [Coin]s van a tener candles mucho mas recientes que 2018, vamos de adelante para atrás
		let date_cursor = Date.now();
		let is_oldest_page = false;
		const max_intervals_in_ms =
			frequency === "hourly" ? 744 * 60 * 60 * 1000 : 180 * 24 * 60 * 60 * 1000;

		while (!is_oldest_page && date_cursor > 1518147224000) {
			const response = await fetch(
				`${this.base_url}/coins/${coin_name}/ohlc/range?vs_currency=usd&interval=${frequency}&from=${date_cursor - max_intervals_in_ms}&to=${date_cursor}`,
				this.request_data,
			);

			const parsedCandles = candlesResponseSchema(response);

			if (parsedCandles instanceof type.errors) throw parsedCandles;

			const mappedCandles = parsedCandles.map((c) => ({
				frequency,
				timestamp: new Date(c[0]),
				open: c[1],
				high: c[2],
				low: c[3],
				close: c[4],
			}));

			// Si la cantidad de candelas devueltas es menor al tamaño maximo de la paginación, corto el loop
			if (
				frequency === "hourly"
					? mappedCandles.length < 744
					: mappedCandles.length < 180
			) {
				is_oldest_page = true;
			}

			candle_data.push(...mappedCandles);

			// Resto 1 más para que la proxima request no overlapee en el query param 'to'
			date_cursor -= max_intervals_in_ms + 1;
		}

		return candle_data;
	}
}
