/// Logica de negocio para el servicio de Tokens
// Quiero que haga las siguientes acciones:
// - Añadir una wallet:
//  - Crear la wallet con la info necesaria (holdings), chequeando en que redes existe
//  - Obtener todo el historial de transacciones de la wallet y guardarlas valuadas en USD
//
// - Enlistar wallets disponibles segun blockchain, devolviendolas valuadas
//
// - Devolver una wallet en detalle:
//  - Grafico de cambio valuación wallet a través del tiempo
//  - Con posible filtro de Coin para devolver solo txs y grafico de valuación de esa coin
//  - distribucion en % de los holdings de esa wallet
//  - variación en las ultimas 24hs de la wallet
//
// - Escuchar a transacciones hechas:
//  - Guardar transacciones nuevas que van llegando
//  - Y cambiar el estado de la wallet de acuerdo a eso
import { blockchains } from "./vars";
export class WalletsService {
    walletsRepository;
    walletsProvider;
    coinsService;
    constructor(wallets_repository, wallets_provider, coins_service) {
        this.walletsRepository = wallets_repository;
        this.walletsProvider = wallets_provider;
        this.coinsService = coins_service;
    }
    /** Añade una [Wallet] */
    async addWallet(address, blockchain) {
        // Busco la wallet con la fuente externa
        const wallet_data = await this.walletsProvider.getWallet(address, blockchain);
        // Añado nuevas [Coin]s que pueda tener la nueva [Wallet] y no existan de antemano
        const coins = await Promise.all(wallet_data.coins.map(async (c) => {
            const coin = await this.coinsService.getCoinByAddress(c.coin_address, wallet_data.blockchain);
            return { ...c, coin };
        }));
        const native_coin = await this.coinsService.getCoinByName(blockchains[wallet_data.blockchain].coin);
        const coined_wallet = {
            ...wallet_data,
            native_coin: native_coin,
            coins,
        };
        // La guardo
        await this.walletsRepository.saveWallet(coined_wallet);
        // Tengo que convertirla en CoinedWallet
        // Para eso busco las coins que tiene la wallet, puede pasar que no existan y las tenga que añadir
        const valued_wallet = await this.getValuedWallet(coined_wallet);
        // Devuelvo las ultimas X transacciones de la [Wallet]
        // Llamemoslas las 'mas recientes'
        // Y despues por atrás ya habiendo devuelto la Wallet, con mas tiempo, guardo todas
        const recent_transactions = await this.walletsProvider.getRecentTransactions(wallet_data);
        const coined_recent_transactions = await this.getCoinDataForTransactions(recent_transactions, blockchain);
        return { ...valued_wallet, transactions: coined_recent_transactions };
    }
    /** Consigue una [CoinedWalletWithTransactions] ya guardada en la DB */
    async getWallet(address, blockchain, transactions_page) {
        // Consigo la [Wallet]
        const coined_wallet = await this.walletsRepository.getWallet(address, blockchain);
        if (!coined_wallet)
            return undefined;
        const valued_wallet = await this.getValuedWallet(coined_wallet);
        // Consigo las [Transaction]s
        const transaction_data = await this.walletsRepository.getTransactions(coined_wallet, transactions_page);
        const valued_transactions = await this.getCoinDataForTransactions(transaction_data, blockchain);
        return { ...valued_wallet, transactions: valued_transactions };
    }
    async getWalletsByBlockchain(blockchain, wallets_page) {
        const coined_wallets = await this.walletsRepository.getWalletsByBlockchain(blockchain, wallets_page);
        const valued_wallets = await Promise.all(coined_wallets.map(async (cw) => await this.getValuedWallet(cw)));
        return valued_wallets;
    }
    /** Hace el backfill de una [Wallet], osea conseguir todo su historial de transacciones
    Puede ser corrido en otro servidor para no congestionar la API, usando una queue */
    async backfillWallet(wallet_data) {
        let loop_cursor = undefined;
        do {
            const { transactions, cursor } = await this.walletsProvider.getTransactionHistory(wallet_data, loop_cursor);
            // Actualizo el cursor para la siguiente query
            loop_cursor = cursor;
            await this.walletsRepository.saveTransactions(transactions);
        } while (loop_cursor !== undefined);
        // Si llego hasta acá sin tirar error, actualizo su status
        await this.walletsRepository.updateWalletBackfillStatus(wallet_data, "complete");
    }
    /** Recibe una [Transaction] y la guarda, cambiando el estado de la [Wallet] relacionada */
    async saveTransaction(transaction_data, blockchain) {
        await this.walletsRepository.saveTransactionAndUpdateWallet(transaction_data, blockchain);
    }
    /// Helper functions:
    /** Consigue las [Coins] relacionadas a las transacciones, incluyendo valuaciones  */
    async getCoinDataForTransactions(transaction_data, blockchain) {
        const coined_transactions = await Promise.all(transaction_data.map(async (c) => {
            // Consigo la [Coin] o [NFT]
            if (c.type === "nft") {
                const nft = await this.coinsService.getNFTByAddress(blockchain, c.coin_address, c.token_id);
                return {
                    ...c,
                    coin: { ...nft, token_id: c.token_id },
                    value_usd: nft.price,
                };
            }
            // Puedo asumir que no es undefined porque si es nativa, la coin ya existe por su nombre
            const coin = c.type === "native"
                ? await this.coinsService.getCoinByName(blockchains[blockchain].coin)
                : await this.coinsService.getCoinByAddress(c.coin_address, blockchain);
            const decimal_places = c.type === "native"
                ? blockchains[c.blockchain].decimal_places
                : coin.contracts.find((co) => co.blockchain === c.blockchain)
                    .decimal_place;
            // El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
            const value_usd = (Number(c.value) * coin.price) /
                Number(BigInt(10 ** decimal_places));
            return { ...c, coin: coin, value_usd };
        }));
        return coined_transactions;
    }
    /** Consigue las [Coin]s relacionadas con la [Wallet], incluyendo valuaciones */
    async getValuedWallet(wallet_data) {
        let total_value_usd = 0;
        const partial_valued_wallet_coins = await Promise.all(wallet_data.coins.map(async (c) => {
            // Agarro los decimales que tiene en esta red esta [Coin]
            const decimal_place = c.coin.contracts.find((c) => c.blockchain === wallet_data.blockchain).decimal_place;
            // El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
            const value_usd = Number(c.value / BigInt(10 ** decimal_place)) * c.coin.price;
            // Sumo al valor total de la wallet
            total_value_usd += value_usd;
            return { ...c, value_usd };
        }));
        // Sumo el valor de la coin nativa
        const decimal_places = blockchains[wallet_data.blockchain].decimal_places;
        const native_value_usd = (Number(wallet_data.native_value) * wallet_data.native_coin.price) /
            Number(BigInt(10 ** decimal_places));
        total_value_usd += native_value_usd;
        // Calculo porcentajes
        const valued_wallet_coins = partial_valued_wallet_coins.map((c) => ({
            ...c,
            percentage_in_wallet: Number(((c.value_usd / total_value_usd) * 100).toFixed(2)),
        }));
        const valued_wallet = {
            ...wallet_data,
            coins: valued_wallet_coins,
            native_value_usd,
            total_value_usd,
        };
        return valued_wallet;
    }
}
