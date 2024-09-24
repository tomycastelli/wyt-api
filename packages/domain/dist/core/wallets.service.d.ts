import { CoinsProvider, CoinsRepository } from "./coins.ports";
import { CoinsService } from "./coins.service";
import { BlockchainsName } from "./vars";
import { CoinedTransaction, CoinedWallet, CoinedWalletWithTransactions, Transaction, ValuedWallet, Wallet } from "./wallets.entities";
import { WalletsProvider, WalletsRepository } from "./wallets.ports";
export declare class WalletsService<WProvider extends WalletsProvider, WRepository extends WalletsRepository, CProvider extends CoinsProvider, CRepository extends CoinsRepository> {
    private walletsRepository;
    private walletsProvider;
    private coinsService;
    constructor(wallets_repository: WRepository, wallets_provider: WProvider, coins_service: CoinsService<CProvider, CRepository>);
    /** Añade una [Wallet] */
    addWallet(address: string, blockchain: BlockchainsName): Promise<CoinedWalletWithTransactions>;
    /** Consigue una [CoinedWalletWithTransactions] ya guardada en la DB */
    getWallet(address: string, blockchain: BlockchainsName, transactions_page: number): Promise<CoinedWalletWithTransactions | undefined>;
    getWalletsByBlockchain(blockchain: BlockchainsName, wallets_page: number): Promise<ValuedWallet[]>;
    /** Hace el backfill de una [Wallet], osea conseguir todo su historial de transacciones
    Puede ser corrido en otro servidor para no congestionar la API, usando una queue */
    backfillWallet(wallet_data: Wallet): Promise<void>;
    /** Recibe una [Transaction] y la guarda, cambiando el estado de la [Wallet] relacionada */
    saveTransaction(transaction_data: Transaction, blockchain: BlockchainsName): Promise<void>;
    /** Consigue las [Coins] relacionadas a las transacciones, incluyendo valuaciones  */
    getCoinDataForTransactions(transaction_data: Transaction[], blockchain: BlockchainsName): Promise<CoinedTransaction[]>;
    /** Consigue las [Coin]s relacionadas con la [Wallet], incluyendo valuaciones */
    getValuedWallet(wallet_data: CoinedWallet): Promise<ValuedWallet>;
}
//# sourceMappingURL=wallets.service.d.ts.map