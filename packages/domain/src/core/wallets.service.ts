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

import { SavedCoin, type SavedNFT } from "./coins.entities";
import type { CoinsProvider, CoinsRepository } from "./coins.ports";
import type { CoinsService } from "./coins.service";
import { type BlockchainsName, blockchains } from "./vars";
import {
	CoinedTransaction,
	CoinedWallet,
	CoinedWalletCoin,
	type CoinedWalletWithTransactions,
	type SavedWallet,
	type Transaction,
	type ValuedTransaction,
	type ValuedTransfer,
	type ValuedWallet,
	type ValuedWalletCoin,
	type Wallet,
} from "./wallets.entities";

import type { WalletsProvider, WalletsRepository } from "./wallets.ports";

export class WalletsService<
	WProvider extends WalletsProvider,
	WRepository extends WalletsRepository,
	CProvider extends CoinsProvider,
	CRepository extends CoinsRepository,
> {
	private walletsRepository: WRepository;
	private walletsProvider: WProvider;
	private coinsService: CoinsService<CProvider, CRepository>;

	constructor(
		wallets_repository: WRepository,
		wallets_provider: WProvider,
		coins_service: CoinsService<CProvider, CRepository>,
	) {
		this.walletsRepository = wallets_repository;
		this.walletsProvider = wallets_provider;
		this.coinsService = coins_service;
	}

	/** Añade una [Wallet] */
	public async addWallet(
		address: string,
		blockchain: BlockchainsName,
	): Promise<CoinedWalletWithTransactions> {
		// Chequeo que no exista antes
		const wallet_exists = await this.walletsRepository.getWallet(
			address,
			blockchain,
		);
		if (wallet_exists) throw Error("The wallet already exists");

		// Busco la wallet con la fuente externa
		const wallet_data: Wallet = await this.walletsProvider.getWallet(
			address,
			blockchain,
		);

		const valued_wallet = await this.getValuedWallet(wallet_data);

		// La guardo
		const { id } = await this.walletsRepository.saveWallet(valued_wallet);

		// Devuelvo las ultimas X transacciones de la [Wallet]
		// Y despues por atrás ya habiendo devuelto la Wallet, con mas tiempo, guardo todas
		const recent_transactions: Transaction[] =
			await this.walletsProvider.getRecentTransactions(wallet_data);

		const valued_recent_transactions = await this.getValuedTransactions(
			recent_transactions,
			blockchain,
		);

		return { ...valued_wallet, transactions: valued_recent_transactions, id };
	}

	/** Consigue una [CoinedWalletWithTransactions] ya guardada en la DB */
	public async getWallet(
		address: string,
		blockchain: BlockchainsName,
		transactions_page: number,
	): Promise<CoinedWalletWithTransactions | undefined> {
		// Consigo la [Wallet]
		const saved_wallet = await this.walletsRepository.getWallet(
			address,
			blockchain,
		);
		if (!saved_wallet) return undefined;

		const valued_wallet = await this.getValuedWallet(saved_wallet);

		// Consigo las [Transaction]s
		const transaction_data = await this.walletsRepository.getTransactions(
			saved_wallet,
			transactions_page,
		);
		const valued_transactions = await this.getValuedTransactions(
			transaction_data,
			blockchain,
		);

		return {
			...valued_wallet,
			transactions: valued_transactions,
			id: saved_wallet.id,
		};
	}

	public async getWalletsByBlockchain(
		blockchain: BlockchainsName,
		wallets_page: number,
	): Promise<ValuedWallet[]> {
		const coined_wallets = await this.walletsRepository.getWalletsByBlockchain(
			blockchain,
			wallets_page,
		);

		const valued_wallets = await Promise.all(
			coined_wallets.map(async (cw) => await this.getValuedWallet(cw)),
		);

		return valued_wallets;
	}

	/** Hace el backfill de una [Wallet], osea conseguir todo su historial de transacciones
  Puede ser corrido en otro servidor para no congestionar la API, usando una queue */
	public async backfillWallet(saved_wallet: SavedWallet): Promise<void> {
		let loop_cursor: string | undefined = undefined;
		do {
			const { transactions, cursor } =
				await this.walletsProvider.getTransactionHistory(
					saved_wallet,
					loop_cursor,
				);

			// Actualizo el cursor para la siguiente query
			loop_cursor = cursor;

			const valued_transactions = await this.getValuedTransactions(
				transactions,
				saved_wallet.blockchain,
			);

			await this.walletsRepository.saveTransactions(valued_transactions);
		} while (loop_cursor);

		// Si llego hasta acá sin tirar error, actualizo su status
		await this.walletsRepository.updateWalletBackfillStatus(
			saved_wallet,
			"complete",
		);
	}

	/** Recibe una [Transaction] y la guarda, cambiando el estado de la [Wallet] relacionada */
	public async saveTransaction(
		transaction_data: Transaction,
		blockchain: BlockchainsName,
	): Promise<void> {
		const [valued_transaction] = await this.getValuedTransactions(
			[transaction_data],
			blockchain,
		);
		await this.walletsRepository.saveTransactionAndUpdateWallet(
			valued_transaction!,
			blockchain,
		);
	}

	/// Helper functions:

	/** Consigue las [Coins] relacionadas a las transacciones, insertandolas si no existían, incluyendo valuaciones  */
	private async getValuedTransactions(
		transaction_data: Transaction[],
		blockchain: BlockchainsName,
	): Promise<ValuedTransaction[]> {
		const valued_transactions = await Promise.all(
			transaction_data.map(async (c) => {
				const valued_transfers: ValuedTransfer[] = await Promise.all(
					c.transfers.map(async (tr) => {
						if (tr.type === "nft") {
							const coin: SavedNFT = await this.coinsService.getNFTByAddress(
								blockchain,
								tr.coin_address!,
								tr.token_id!,
							);

							return { ...tr, coin, value_usd: 0 };
						}
						const coin =
							tr.type === "native"
								? await this.coinsService.getCoinByName(
										blockchains[blockchain].coin,
									)
								: await this.coinsService.getCoinByAddress(
										tr.coin_address!,
										blockchain,
									);

						const decimal_places =
							tr.type === "native"
								? blockchains[c.blockchain].decimal_places
								: coin!.contracts.find((co) => co.blockchain === c.blockchain)!
										.decimal_place;

						const value_usd =
							(Number(tr.value) * coin!.price) /
							Number(BigInt(10 ** decimal_places));

						return { ...tr, coin: coin!, value_usd };
					}),
				);

				return { ...c, transfers: valued_transfers };
			}),
		);
		return valued_transactions;
	}

	/** Consigue las [Coin]s relacionadas con la [Wallet], añadiendolas si no existen e incluyendo valuaciones */
	private async getValuedWallet(wallet_data: Wallet): Promise<ValuedWallet> {
		let total_value_usd = 0;
		let data: Omit<ValuedWalletCoin, "percentage_in_wallet">[] = [];
		try {
			const partial_valued_wallet_coins: Omit<
				ValuedWalletCoin,
				"percentage_in_wallet"
			>[] = await Promise.all(
				wallet_data.coins.map(async (c) => {
					if (c.token_id) {
						// Es un NFT
						const nft = await this.coinsService.getNFTByAddress(
							wallet_data.blockchain,
							c.coin_address,
							c.token_id!,
						);

						// El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
						const value_usd = 0;

						return { ...c, coin: nft, value_usd };
					}
					// Es un coin
					const coin = await this.coinsService.getCoinByAddress(
						c.coin_address,
						wallet_data.blockchain,
					);
					// Agarro los decimales que tiene en esta red esta [Coin]
					const decimal_place = coin.contracts.find(
						(c) => c.blockchain === wallet_data.blockchain,
					)!.decimal_place;

					// El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
					const value_usd =
						Number(c.value / BigInt(10 ** decimal_place)) * coin.price;

					// Sumo al valor total de la wallet
					total_value_usd += value_usd;

					return { ...c, value_usd, coin };
				}),
			);
			data = partial_valued_wallet_coins;
		} catch (err) {
			console.error(err);
		}

		const native_coin = await this.coinsService.getCoinByName(
			blockchains[wallet_data.blockchain].coin,
		);

		// Sumo el valor de la coin nativa
		const decimal_places = blockchains[wallet_data.blockchain].decimal_places;

		const native_value_usd =
			(Number(wallet_data.native_value) * native_coin!.price) /
			Number(BigInt(10 ** decimal_places));

		total_value_usd += native_value_usd;

		// Calculo porcentajes
		const valued_wallet_coins: ValuedWalletCoin[] = data.map((c) => ({
			...c,
			percentage_in_wallet: Number(
				((c.value_usd / total_value_usd) * 100).toFixed(2),
			),
		}));

		const valued_wallet: ValuedWallet = {
			...wallet_data,
			native_coin: native_coin!,
			coins: valued_wallet_coins,
			native_value_usd,
			total_value_usd,
		};

		return valued_wallet;
	}
}
