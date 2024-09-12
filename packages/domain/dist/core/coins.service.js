import { base_coins, blockchains } from "./vars";
import CoinsPostgres from "../adapters/postgres/postgres";
import CoinGecko from "../adapters/providers/coingecko";
import moment from "moment";
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
    coinsRepository;
    coinsProvider;
    constructor(postgres_url, coingecko_api_key) {
        this.coinsRepository = new CoinsPostgres(postgres_url);
        this.coinsProvider = new CoinGecko(coingecko_api_key);
    }
    /** Devuelve todas las [Coin]s disponibles */
    async listAllCoins() {
        return await this.coinsRepository.getAllCoins();
    }
    /** Devuelve una [Coin] por id */
    async getCoinById(id) {
        return await this.coinsRepository.getCoinById(id);
    }
    /** Devuelve una [Coin] por su nombre */
    async getCoinByName(coin_name) {
        return await this.coinsRepository.getCoinByName(coin_name);
    }
    async getCoinsByBlockchain(blockchain, page_number, page_size, name_search) {
        return await this.coinsRepository.getCoinsByBlockchain(blockchain, page_number, page_size, name_search);
    }
    /** Guarda las [Coin]s mas recientes */
    async saveLatestCoins() {
        const latestCoins = await this.coinsProvider.getLatestCoins(blockchains, 10_000);
        const savedCoins = await this.coinsRepository.saveCoins(latestCoins);
        return savedCoins;
    }
    /** Guardo todas las [Coin]s disponibles */
    async saveAllCoins() {
        // Pido coins con capitalizacion mayor a 10_000 USD
        const allCoins = await this.coinsProvider.getAllCoins(blockchains, base_coins, 10_000);
        const savedCoins = await this.coinsRepository.saveCoins(allCoins);
        return savedCoins;
    }
    /** Devuelve todas las [Candle]s guardadas segun el rango */
    async getCandlesByDate(frequency, coin_id, from_date, to_date) {
        const from = from_date
            ? from_date
            : frequency === "daily"
                ? moment().subtract(1, "month").toDate()
                : moment().subtract(1, "day").toDate();
        const to = to_date ? to_date : moment().add(1, "minute").toDate();
        return await this.coinsRepository.getCandles(frequency, coin_id, from, to);
    }
    /** Guarda las ultimas [Candle] mas recientes segun la frecuencia y la tasa de refresco (cada cuanto se guarda) */
    async saveCandles(coin_id, frequency, refresh_rate) {
        const savedCoin = await this.coinsRepository.getCoinById(coin_id);
        const candles = await this.coinsProvider.getCandleData(frequency, savedCoin.name, refresh_rate);
        await this.coinsRepository.saveCandles(candles.map((c) => ({ coin_id, ...c })));
    }
    async updateMarketData() {
        const market_data = await this.coinsProvider.getAllCoinMarketData();
        await this.coinsRepository.saveMarketData(market_data);
    }
}
