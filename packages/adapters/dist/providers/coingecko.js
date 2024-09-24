import { type } from "arktype";
import pLimit from "p-limit";
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
        "+": "delete",
    },
    "+": "delete",
});
const marketDataListSchema = type({
    id: "string",
    current_price: "number",
    market_cap: "number",
    price_change_percentage_24h: "number",
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
export class CoinGecko {
    base_url = "https://pro-api.coingecko.com/api/v3";
    blockchains_categories = [
        "ethereum-ecosystem",
        "solana-ecosystem",
        "avalanche-ecosystem",
        "polygon-ecosystem",
    ];
    rate_limit = pLimit(6);
    request_data;
    constructor(api_key) {
        this.request_data = {
            method: "GET",
            headers: {
                accept: "application/json",
                "x-cg-pro-api-key": api_key,
            },
        };
    }
    async getAllCoins(blockchains, base_coins, minimum_market_cap) {
        const response = await fetch(`${this.base_url}/coins/list?include_platform=true`, this.request_data).then((res) => res.json());
        const parsedList = coinsResponseSchema(response);
        if (parsedList instanceof type.errors)
            throw parsedList;
        // Se filtran los tokens que esten dentro de las blockchains que nos interesan
        const filteredList = parsedList
            .filter((coin) => {
            return (base_coins.includes(coin.id) ||
                Object.keys(coin.platforms).some((platform) => blockchains.includes(platform)));
        })
            .slice(0, 8);
        // Para cada token se consulta el resto de info:
        // 'descripcion', 'image_url', 'market_data'
        const detailsListPromises = filteredList.map((coin) => {
            // Rate limit de 360req/min, menos que el limite de CoinGecko (500)
            // Para darle espacio a otras requests que puedan suceder
            return this.rate_limit(async () => {
                const response = await fetch(`
          ${this.base_url}/coins/${coin.id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`, this.request_data).then((res) => res.json());
                const parsedCoinDetails = coinDetailsSchema(response);
                if (parsedCoinDetails instanceof type.errors)
                    throw parsedCoinDetails;
                return { ...parsedCoinDetails, ...coin };
            });
        });
        const coinDetails = await Promise.all(detailsListPromises);
        const mappedCoinDetails = coinDetails
            .filter((coin) => coin.description &&
            coin.image &&
            coin.market_data &&
            coin.market_data.current_price?.usd &&
            coin.market_data.ath?.usd &&
            coin.market_data.price_change_percentage_24h &&
            (coin.market_data.market_cap?.usd ?? 0) >= minimum_market_cap)
            .map((coin) => ({
            name: coin.id,
            symbol: coin.symbol,
            provider: "coin_gecko",
            description: coin.description.en,
            ath: coin.market_data.ath.usd,
            image_url: coin.image.large,
            market_cap: coin.market_data.market_cap.usd,
            price: coin.market_data.current_price.usd,
            price_change_24h: coin.market_data.price_change_percentage_24h,
            // Me quedo con solo los contratos que me interesan
            contracts: Object.entries(coin.platforms)
                .filter(([key]) => blockchains.includes(key))
                .map(([blockchain, address]) => ({ blockchain, address })),
        }));
        return mappedCoinDetails;
    }
    async getCandleData(frequency, coin_name, refresh_rate) {
        // Si es diario, quiero solo la ultima hora
        // Los datos estan disponibles 35 minutos despues
        // Minimo llamar a los 36 minutos para asegurarse tener la candela
        const now = new Date();
        if (frequency === "daily" && now.getUTCMinutes() <= 35) {
            throw new Error("Must be called after the 35 minutes of the day");
        }
        // Pido los dias minimos para satisfacer el intervalo
        const minimumDays = frequency === "hourly" ? Math.ceil(refresh_rate / 24) : refresh_rate;
        // La API acepta estos numeros
        const acceptedDays = [1, 7, 14, 30, 90].filter((d) => d >= minimumDays);
        const daysToFetch = acceptedDays.length > 0 ? Math.min(...acceptedDays) : 1;
        const response = await fetch(`${this.base_url}/coins/${coin_name}/ohlc?vs_currency=usd&days=${daysToFetch}&precision=18&interval=${frequency}`, this.request_data).then((res) => res.json());
        const parsedCandles = candlesResponseSchema(response);
        if (parsedCandles instanceof type.errors)
            throw parsedCandles;
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
    async getLatestCoins(blockchains, minimum_market_cap) {
        const response = await fetch(`${this.base_url}/coins/list/new`, this.request_data).then((res) => res.json());
        const parsedLatestCoins = latestCoinsResponseSchema(response);
        if (parsedLatestCoins instanceof type.errors)
            throw parsedLatestCoins;
        // Para cada token se consulta el resto de info:
        // 'descripcion', 'image_url', 'market_data'
        const detailsListPromises = parsedLatestCoins.map((coin) => {
            // Rate limit de 360req/min, menos que el limite de CoinGecko (500)
            // Para darle espacio a otras requests que puedan suceder
            return this.rate_limit(async () => {
                const response = await fetch(`
          ${this.base_url}/coins/${coin.id}?localization=false&tickers=false&market_data=true&sparkline=false&community_data=false&developer_data=false`, this.request_data).then((res) => res.json());
                const parsedCoinDetails = coinDetailsSchema.merge({
                    platforms: "Record<string, string|null>",
                })(response);
                if (parsedCoinDetails instanceof type.errors) {
                    console.log("Error!: ", parsedCoinDetails.summary);
                    console.log("Problem response: ", response);
                    throw parsedCoinDetails;
                }
                return { ...parsedCoinDetails, ...coin };
            });
        });
        const coinDetails = await Promise.all(detailsListPromises);
        console.log("Detailed list: ", coinDetails.slice(0, 2));
        const mappedCoinDetails = coinDetails
            .filter((coin) => coin.description &&
            coin.image &&
            coin.market_data &&
            coin.market_data.current_price?.usd &&
            coin.market_data.ath?.usd &&
            coin.market_data.price_change_percentage_24h &&
            Object.keys(coin.platforms).some((platform) => blockchains.includes(platform)) &&
            (coin.market_data.market_cap?.usd ?? 0) >= minimum_market_cap)
            .map((coin) => ({
            name: coin.id,
            symbol: coin.symbol,
            provider: "coin_gecko",
            description: coin.description.en,
            ath: coin.market_data.ath.usd,
            image_url: coin.image.large,
            market_cap: coin.market_data.market_cap.usd,
            price: coin.market_data.current_price.usd,
            price_change_24h: coin.market_data.price_change_percentage_24h,
            // Me quedo con solo los contratos que me interesan
            contracts: Object.entries(coin.platforms)
                .filter(([key]) => blockchains.includes(key))
                .map(([blockchain, address]) => ({ blockchain, address: address })),
        }));
        return mappedCoinDetails;
    }
    async getAllCoinMarketData() {
        const market_data_array = [];
        // Vamos a ir haciendo requests por categoria
        for (const category of this.blockchains_categories) {
            let is_last_page = false;
            let page = 1;
            while (!is_last_page) {
                const response = await fetch(`${this.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&price_change_percentage=24h&locale=en&precision=18&category=${category}&page=${page}`, this.request_data).then((res) => res.json());
                page++;
                const parsedMarketData = marketDataListSchema.array()(response);
                if (parsedMarketData instanceof type.errors)
                    throw parsedMarketData;
                if (parsedMarketData.length < 250) {
                    // Termino el loop con esta iteracion
                    is_last_page = true;
                }
                const mappedMarketData = parsedMarketData.map((md) => ({
                    name: md.id,
                    ath: md.ath,
                    market_cap: md.market_cap,
                    price: md.current_price,
                    price_change_24h: md.price_change_percentage_24h,
                }));
                market_data_array.push(...mappedMarketData);
            }
        }
        return market_data_array;
    }
}