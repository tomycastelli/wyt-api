import { blockchains } from "./vars";
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
export class CoinsService {
    coinsRepository;
    coinsProvider;
    constructor(repository, provider) {
        this.coinsRepository = repository;
        this.coinsProvider = provider;
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
    /** Devuelve una [Coin] por su contract address */
    async getCoinByAddress(coin_address, blockchain) {
        const coin = await this.coinsRepository.getCoinByAddress(coin_address, blockchain);
        // Si la [Coin] ya esta guardada la devuelvo, actualizando la market data antes
        if (coin) {
            const market_data = await this.coinsProvider.getCoinMarketData(coin.name);
            await this.coinsRepository.saveMarketData([market_data]);
            return coin;
        }
        const newCoin = await this.coinsProvider.getCoinByAddress(coin_address, blockchain);
        const [savedCoin] = await this.coinsRepository.saveCoins([newCoin]);
        // Se que no es undefined porque le pase solo un elemento y estoy agarrando el primero
        return savedCoin;
    }
    /** Devuelve una [NFT] por su contract_address y token_id */
    async getNFTByAddress(blockchain, contract_address, token_id) {
        let nft = await this.coinsRepository.getNFTByAddress(contract_address, token_id);
        // Si la [NFT] ya esta guardada la devuelvo
        if (nft)
            return nft;
        const newNFT = await this.coinsProvider.getNFTByAddress(contract_address, blockchain);
        const [savedNFT] = await this.coinsRepository.saveNFTs([
            { ...newNFT, token_id },
        ]);
        // Se que no es undefined porque le pase solo un elemento y estoy agarrando el primero
        return savedNFT;
    }
    async getCoinsByBlockchain(blockchain, page_number, page_size, name_search) {
        const coinsData = await this.coinsRepository.getCoinsByBlockchain(blockchain, page_number, page_size);
        if (name_search) {
            const coinsFuse = new Fuse(coinsData, { keys: ["name"] });
            return coinsFuse.search(name_search).map((f) => f.item);
        }
        return coinsData;
    }
    /** Guarda las [Coin]s mas recientes */
    async saveLatestCoins() {
        const latestCoins = await this.coinsProvider.getLatestCoins(Object.keys(blockchains), 100_000);
        const savedCoins = await this.coinsRepository.saveCoins(latestCoins);
        return savedCoins;
    }
    /** Guardo todas las [Coin]s disponibles */
    async saveAllCoins() {
        // Pido coins con capitalizacion mayor a 100_000 USD
        const allCoins = await this.coinsProvider.getAllCoins(100_000);
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
        if (!savedCoin) {
            return undefined;
        }
        const candles = await this.coinsProvider.getCandleData(frequency, savedCoin.name, refresh_rate);
        await this.coinsRepository.saveCandles(candles.map((c) => ({ coin_id, ...c })));
    }
    /** Actualiza los datos de mercado relacionados a las coins, para todas las coins disponibles */
    async updateMarketData() {
        const market_data = await this.coinsProvider.getAllCoinMarketData();
        await this.coinsRepository.saveMarketData(market_data);
    }
    async searchCoinsByName(name_search) {
        const coinsData = await this.coinsRepository.getAllCoins();
        const coinsFuse = new Fuse(coinsData, { keys: ["name"], threshold: 0.25 });
        return coinsFuse.search(name_search).map((f) => f.item);
    }
}
