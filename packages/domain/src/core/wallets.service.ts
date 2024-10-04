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

import type { SavedCoin, SavedNFT } from "./coins.entities.js";
import type { CoinsProvider, CoinsRepository } from "./coins.ports.js";
import type { CoinsService } from "./coins.service.js";
import { type BlockchainsName, blockchains } from "./vars.js";
import type {
  CoinedTransaction,
  CoinedTransfer,
  CoinedWallet,
  SavedWallet,
  Transaction,
  ValueChangeGraph,
  ValuedTransaction,
  ValuedTransfer,
  ValuedWallet,
  ValuedWalletCoin,
  ValuedWalletWithTransactions,
  Wallet,
} from "./wallets.entities.js";

import type {
  WalletsRepository,
  WalletsStreamsProvider,
} from "./wallets.ports.js";

export class WalletsService<
  WProvider extends WalletsStreamsProvider,
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

  /** Añade una [Wallet] con sus posesiones, y sus transacciones mas recientes */
  public async addWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<{
    valued_wallet_with_transactions: ValuedWalletWithTransactions;
    new_coins: SavedCoin[];
  } | null> {
    // Chequeo que no exista antes
    const wallet_exists = await this.walletsRepository.getWallet(
      address,
      blockchain,
    );
    if (wallet_exists) throw Error("The wallet already exists");

    // Busco la wallet con la fuente externa
    const wallet_data = await this.walletsProvider.getWallet(
      address,
      blockchain,
    );

    if (!wallet_data) return null;

    const { valued_wallet, new_coins: new_wallet_coins } =
      await this.getValuedWallet(wallet_data);

    // La guardo
    const { id, last_update } =
      await this.walletsRepository.saveWallet(valued_wallet);

    // Devuelvo las ultimas transacciones de la [Wallet]
    const recent_transactions: Transaction[] =
      await this.walletsProvider.getRecentTransactions(wallet_data);

    const { valued_transactions, new_coins: new_tx_coins } =
      await this.getValuedTransactions(recent_transactions, blockchain);

    return {
      valued_wallet_with_transactions: {
        id,
        ...valued_wallet,
        last_update,
        transactions: valued_transactions,
      },
      new_coins: [...new_wallet_coins, ...new_tx_coins],
    };
  }

  /** Consigue una [ValuedWalletWithTransactions] ya guardada en la DB */
  public async getWalletWithTransactions(
    address: string,
    blockchain: BlockchainsName,
    transactions_page: number,
  ): Promise<ValuedWalletWithTransactions | null> {
    // Consigo la [Wallet]
    const saved_wallet = await this.walletsRepository.getWallet(
      address,
      blockchain,
    );
    if (!saved_wallet) return null;

    const { valued_wallet } = await this.getValuedWallet(saved_wallet);

    // Consigo las [Transaction]s
    const transaction_data = await this.walletsRepository.getTransactions(
      saved_wallet.address,
      transactions_page,
    );
    const { valued_transactions } = await this.getValuedTransactions(
      transaction_data,
      blockchain,
    );

    return {
      id: saved_wallet.id,
      ...valued_wallet,
      last_update: saved_wallet.last_update,
      transactions: valued_transactions,
    };
  }

  public async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedWallet | undefined> {
    // Consigo la [Wallet]
    const saved_wallet = await this.walletsRepository.getWallet(
      address,
      blockchain,
    );
    if (!saved_wallet) return undefined;

    return saved_wallet;
  }

  public async getValuedWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
    ids?: number[],
  ): Promise<ValuedWallet[]> {
    const saved_wallets = await this.walletsRepository.getWalletsByBlockchain(
      blockchain,
      wallets_page,
      ids,
    );

    const valued_wallets = await Promise.all(
      saved_wallets.map(async (cw) => await this.getValuedWallet(cw)),
    );

    return valued_wallets.map((vw) => vw.valued_wallet);
  }

  public async getWalletsByBlockchain(
    blockchain: BlockchainsName,
    page: number,
  ): Promise<SavedWallet[]> {
    const saved_wallets = await this.walletsRepository.getWalletsByBlockchain(
      blockchain,
      page,
    );

    return saved_wallets;
  }

  /** Hace el backfill de una [Wallet], osea conseguir todo su historial de transacciones
  Puede ser corrido en otro servidor para no congestionar la API, usando una queue */
  public async backfillWallet(
    saved_wallet: SavedWallet,
    stream_webhook_url: string,
  ): Promise<{ new_coins: SavedCoin[] }> {
    const new_coins: SavedCoin[] = [];
    let first_transfer_date: Date | null = null;
    let loop_cursor: string | undefined = undefined;
    do {
      const { transactions, cursor } =
        await this.walletsProvider.getTransactionHistory(
          saved_wallet,
          loop_cursor,
        );

      // Actualizo el cursor para la siguiente query
      loop_cursor = cursor;

      const { coined_transactions, new_coins: new_looped_coins } =
        await this.getCoinedTransactions(transactions, saved_wallet.blockchain);

      new_coins.push(...new_looped_coins);

      await this.walletsRepository.saveTransactions(coined_transactions);

      // Guardo la fecha de la primera tx, puede ser null si no hay una sola transaccion
      if (transactions.length > 0) {
        first_transfer_date =
          transactions[transactions.length - 1]!.block_timestamp;
      }
    } while (loop_cursor);

    // Si llego hasta acá sin tirar error, actualizo su status
    await this.walletsRepository.updateWalletBackfillStatus(
      saved_wallet,
      "complete",
      first_transfer_date,
    );

    // Si estoy en prod y el ecosistema es Ethereum, añado la Wallet al stream
    const ecosystem = blockchains[saved_wallet.blockchain].ecosystem;

    if (process.env.NODE_ENV === "production" && ecosystem === "ethereum") {
      // Me fijo si ya existe un stream de esta blockchain
      const streams = await this.walletsProvider.getAllStreams();
      const this_blockchain_stream = streams.find(
        (s) => s.blockchain === saved_wallet.blockchain,
      );

      if (this_blockchain_stream) {
        // Añado la [Wallet] address al stream
        await this.walletsProvider.addAddressToStream(
          this_blockchain_stream.id,
          saved_wallet.address,
        );
      } else {
        // Lo creo
        const stream = await this.walletsProvider.createStream(
          stream_webhook_url,
          `${saved_wallet.blockchain} + -transactions`,
          saved_wallet.blockchain,
          saved_wallet.blockchain,
        );

        // Añado la [Wallet] address al stream
        await this.walletsProvider.addAddressToStream(
          stream.id,
          saved_wallet.address,
        );
      }
    }

    return { new_coins };
  }

  /** Verifica un webhook */
  public validateWebhookTransaction(
    body: any,
    secret_key: string,
    headers: Record<string, string>,
  ): boolean {
    return this.walletsProvider.validateWebhookTransaction(
      body,
      secret_key,
      headers,
    );
  }

  /** Parsea y guarda las [Transaction]s que vienen de un webhook
  Devuelve undefined si no es un webhook que nos interese, por ej txs no confirmadas */
  public async handleWebhookTransaction(
    body: any,
    blockchain: BlockchainsName,
  ): Promise<{ new_coins: SavedCoin[] } | null> {
    // Si no es ethereum, no se soportan todavia streams
    const ecosystem = blockchains[blockchain].ecosystem;
    if (ecosystem !== "ethereum") return null;

    const transaction_data = this.walletsProvider.parseWebhookTransaction(
      body,
      blockchain,
    );

    if (!transaction_data) {
      return null;
    }

    const { coined_transactions, new_coins } = await this.getCoinedTransactions(
      transaction_data,
      blockchain,
    );

    for (const coined_transaction of coined_transactions) {
      await this.walletsRepository.saveTransactionAndUpdateWallet(
        coined_transaction,
      );
    }

    return { new_coins };
  }

  /** Actualiza los token holdings de la [Wallet] y consigue nuevas transacciones vinculadas.
  El cambio del estado se hace directo sin recurrir a las [Transaction]s. */
  public async updateWallet(
    saved_wallet: SavedWallet,
  ): Promise<{ new_coins: SavedCoin[] } | null> {
    // Si esta pendiente de backfill no la actualizo todavía
    if (saved_wallet.backfill_status === "pending") return null;

    const updated_wallet_data = await this.walletsProvider.getWallet(
      saved_wallet.address,
      saved_wallet.blockchain,
    );

    if (!updated_wallet_data) return null;

    const { valued_wallet, new_coins: new_wallet_coins } =
      await this.getValuedWallet(updated_wallet_data);

    // Actualizo sus posesiones
    await this.walletsRepository.updateWallet(saved_wallet.id, valued_wallet);

    // Consigo las nuevas transacciones
    const transactions = await this.walletsRepository.getTransactions(
      saved_wallet.address,
      1,
    );
    const latest_date =
      transactions.length > 0
        ? transactions.reduce((latest, current) => {
            return current.block_timestamp > latest!.block_timestamp
              ? current
              : latest;
          }, transactions[0])!.block_timestamp
        : new Date(0);

    const new_transactions =
      await this.walletsProvider.getAllTransactionsFromDate(
        saved_wallet,
        latest_date,
      );

    const { coined_transactions, new_coins: new_tx_coins } =
      await this.getCoinedTransactions(
        new_transactions,
        saved_wallet.blockchain,
      );

    // Guardo las nuevas transacciones
    await this.walletsRepository.saveTransactions(coined_transactions);

    return { new_coins: [...new_wallet_coins, ...new_tx_coins] };
  }

  /// Helper functions:

  /** Consigue las [Coins] relacionadas a las transacciones, insertandolas si no existían,
  ignorando las que no están en el proveedor e incluyendo valuaciones  */
  private async getValuedTransactions(
    transaction_data: Transaction[],
    blockchain: BlockchainsName,
  ): Promise<{
    valued_transactions: ValuedTransaction[];
    new_coins: SavedCoin[];
  }> {
    const native_coin = await this.coinsService.getCoinByName(
      blockchains[blockchain].coin,
    );

    const new_coins: SavedCoin[] = [];

    // Voy a hacer un cache local de coins buscadas en la DB previamente
    const queried_coins: Map<string, SavedCoin> = new Map();

    const valued_transactions: ValuedTransaction[] = [];
    for (const tx of transaction_data) {
      const valued_transfers: ValuedTransfer[] = [];
      for (const tr of tx.transfers) {
        if (tr.type === "nft") {
          const coin: SavedNFT = await this.coinsService.getNFTByAddress(
            blockchain,
            tr.coin_address!,
            tr.token_id!,
          );

          valued_transfers.push({ ...tr, coin, value_usd: 0 });
        } else if (tr.type === "native") {
          const decimal_places = blockchains[tx.blockchain].decimal_places;

          const value_usd =
            (Number(tr.value) * native_coin!.price) /
            Number(BigInt(10 ** decimal_places));

          valued_transfers.push({ ...tr, coin: native_coin!, value_usd });
        } else {
          // Es token
          let coin: SavedCoin | null =
            queried_coins.get(tr.coin_address!) ?? null;

          // Si no esta en el cache
          if (!coin) {
            const fetched_coin = await this.coinsService.getCoinByAddress(
              tr.coin_address!,
              blockchain,
            );

            // Si no existe la [Coin] en el servicio
            if (!fetched_coin) continue;

            if (fetched_coin.is_new) new_coins.push(fetched_coin.saved_coin);

            coin = fetched_coin.saved_coin;

            // La guardo en el cache
            queried_coins.set(tr.coin_address!, fetched_coin.saved_coin);
          }

          const decimal_places = coin.contracts.find(
            (co) => co.blockchain === tx.blockchain,
          )!.decimal_place;

          const value_usd =
            (Number(tr.value) * coin.price) /
            Number(BigInt(10 ** decimal_places));

          valued_transfers.push({ ...tr, coin: coin, value_usd });
        }
      }

      // Si no hay transfers despues de buscar las Coins, no agrego la tx
      if (valued_transfers.length === 0) continue;

      // Calculo el valor en USD del fee
      const decimal_places = blockchains[tx.blockchain].decimal_places;
      const fee_usd =
        (Number(tx.fee) * native_coin!.price) /
        Number(BigInt(10 ** decimal_places));

      valued_transactions.push({ ...tx, transfers: valued_transfers, fee_usd });
    }

    return { valued_transactions, new_coins };
  }

  /** Consigue las [Coins] relacionadas a las transacciones, insertandolas si no existían,
  ignorando las que no están en el proveedor  */
  private async getCoinedTransactions(
    transaction_data: Transaction[],
    blockchain: BlockchainsName,
  ): Promise<{
    coined_transactions: CoinedTransaction[];
    new_coins: SavedCoin[];
  }> {
    const native_coin = await this.coinsService.getCoinByName(
      blockchains[blockchain].coin,
    );

    const new_coins: SavedCoin[] = [];

    // Voy a hacer un cache local de coins buscadas en la DB previamente
    const queried_coins: Map<string, SavedCoin> = new Map();

    const coined_transactions: CoinedTransaction[] = [];
    for (const tx of transaction_data) {
      const valued_transfers: CoinedTransfer[] = [];
      for (const tr of tx.transfers) {
        if (tr.type === "nft") {
          const coin: SavedNFT = await this.coinsService.getNFTByAddress(
            blockchain,
            tr.coin_address!,
            tr.token_id!,
          );

          valued_transfers.push({ ...tr, coin });
        } else if (tr.type === "native") {
          valued_transfers.push({ ...tr, coin: native_coin! });
        } else {
          // Es token
          let coin: SavedCoin | null =
            queried_coins.get(tr.coin_address!) ?? null;

          // Si no esta en el cache
          if (!coin) {
            const fetched_coin = await this.coinsService.getCoinByAddress(
              tr.coin_address!,
              blockchain,
            );

            // Si no existe la [Coin] en el servicio
            if (!fetched_coin) continue;

            if (fetched_coin.is_new) new_coins.push(fetched_coin.saved_coin);

            coin = fetched_coin.saved_coin;

            // La guardo en el cache
            queried_coins.set(tr.coin_address!, fetched_coin.saved_coin);
          }

          valued_transfers.push({ ...tr, coin: coin });
        }
      }

      // Si no hay transfers despues de buscar las Coins, no agrego la tx
      if (valued_transfers.length === 0) continue;

      coined_transactions.push({ ...tx, transfers: valued_transfers });
    }

    return { coined_transactions, new_coins };
  }

  /** Consigue las [Coin]s relacionadas con la [Wallet].
  Añadiendolas si no existen, filtrando las que no estan en el provedor de Coins e incluyendo valuaciones */
  private async getValuedWallet(
    wallet_data: Wallet,
  ): Promise<{ valued_wallet: ValuedWallet; new_coins: SavedCoin[] }> {
    let total_value_usd = 0;
    const partial_valued_wallet_coins: Omit<
      ValuedWalletCoin,
      "percentage_in_wallet"
    >[] = [];

    const new_coins: SavedCoin[] = [];

    // Voy a hacer un cache local de coins buscadas en la DB previamente
    const queried_coins: Map<string, SavedCoin> = new Map();

    for (const c of wallet_data.coins) {
      if (c.token_id) {
        // Es un NFT
        const nft = await this.coinsService.getNFTByAddress(
          wallet_data.blockchain,
          c.coin_address,
          c.token_id!,
        );

        // El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
        const value_usd = 0;

        partial_valued_wallet_coins.push({ ...c, coin: nft, value_usd });
      } else {
        // Es token
        let coin: SavedCoin | null = queried_coins.get(c.coin_address!) ?? null;

        // Si no esta en el cache
        if (!coin) {
          const fetched_coin = await this.coinsService.getCoinByAddress(
            c.coin_address!,
            wallet_data.blockchain,
          );

          // Si no existe la [Coin] en el servicio
          if (!fetched_coin) continue;

          if (fetched_coin.is_new) new_coins.push(fetched_coin.saved_coin);

          coin = fetched_coin.saved_coin;

          // La guardo en el cache
          queried_coins.set(c.coin_address!, fetched_coin.saved_coin);
        }

        // Agarro los decimales que tiene en esta red esta [Coin]
        const decimal_place = coin.contracts.find(
          (c) => c.blockchain === wallet_data.blockchain,
        )!.decimal_place;

        // El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
        const value_usd =
          Number(c.value / BigInt(10 ** decimal_place)) * coin.price;

        // Sumo al valor total de la wallet
        total_value_usd += value_usd;

        partial_valued_wallet_coins.push({ ...c, value_usd, coin });
      }
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
    const valued_wallet_coins: ValuedWalletCoin[] =
      partial_valued_wallet_coins.map((c) => ({
        ...c,
        percentage_in_wallet: Number(
          ((c.value_usd / total_value_usd) * 100).toFixed(2),
        ),
      }));

    const valued_wallet: ValuedWallet = {
      ...wallet_data,
      native_value_usd,
      total_value_usd,
      native_coin: native_coin!,
      coins: valued_wallet_coins,
    };

    return { valued_wallet, new_coins };
  }

  private getTimeKey(date: Date, granularity: "hourly" | "daily"): number {
    switch (granularity) {
      case "hourly":
        return date.getTime() - (date.getTime() % (60 * 60 * 1000)); // Round to the nearest hour
      case "daily":
        return date.getTime() - (date.getTime() % (24 * 60 * 60 * 1000)); // Round to the nearest day
    }
  }

  private subtractTime(
    date: Date,
    time_range: "hour" | "day" | "week" | "month" | "year",
  ): Date {
    const newDate = new Date(date.getTime()); // Create a copy of the input date

    switch (time_range) {
      case "hour":
        newDate.setHours(newDate.getHours() - 1);
        break;
      case "day":
        newDate.setDate(newDate.getDate() - 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() - 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() - 1);
        break;
      case "year":
        newDate.setFullYear(newDate.getFullYear() - 1);
        break;
    }

    return newDate; // Return the new date
  }

  /** Genera un gráfico a través del tiempo del valor total de una [Wallet].
  El atributo _value_ va a ser en la moneda nativa a la [Blockchain]. \
  Granularidad del gráfico:
  - Diario: horaria
  - Semanal: diaria
  - Mensual: diaria
  - Anual: diaria
  */
  public async getWalletValueChangeGraph(
    valued_wallet: ValuedWallet,
    time_range: "day" | "week" | "month" | "year",
  ): Promise<ValueChangeGraph> {
    // Necesito saber las posesiones de la [Wallet] en el rango dado
    // Para eso veo las posesiones actuales y las transacciones que sucedieron hasta el fin del rango
    const current_date = new Date();

    const granularity = time_range === "day" ? "hourly" : "daily";

    const transactions = await this.walletsRepository.getTransactionsByRange(
      valued_wallet.address,
      this.subtractTime(current_date, time_range),
      current_date,
    );

    const current_usd_balance = valued_wallet.total_value_usd;
    const current_native_balance = valued_wallet.native_value;

    const value_change_graph: ValueChangeGraph = [
      {
        timestamp: new Date(),
        value: current_native_balance,
        value_usd: current_usd_balance,
      },
    ];

    // Si no hay transacciones devuelvo el valor de ahora y listo
    if (transactions.length === 0) return value_change_graph;

    // Veo como fue el saldo neto de los valores de cada [Coin] desde ahora hasta el 'from_date'
    // El map es:
    // coin_id: { time_key: value }
    const values_map: Map<number, Map<number, bigint>> = new Map();

    // Hago un map de coin_id: decimal_places para mas tarde
    const decimal_places_map: Map<number, number> = new Map();

    decimal_places_map.set(
      valued_wallet.native_coin.id,
      blockchains[valued_wallet.blockchain].decimal_places,
    );

    // Asumo que no hay [Coin]s nuevas porque ya existen las transacciones en el sistema
    const { coined_transactions } = await this.getCoinedTransactions(
      transactions,
      valued_wallet.blockchain,
    );

    for (const transaction of coined_transactions) {
      const transaction_time_key = this.getTimeKey(
        transaction.block_timestamp,
        granularity,
      );

      // Cargo la fee en la native coin
      if (transaction.from_address === valued_wallet.address) {
        const native_coin_map = values_map.get(valued_wallet.native_coin.id);
        if (native_coin_map) {
          const current_value = native_coin_map.get(transaction_time_key) ?? 0n;
          native_coin_map.set(
            transaction_time_key,
            current_value - transaction.fee,
          );
        } else {
          const native_coin_value = new Map<number, bigint>([
            [transaction_time_key, -transaction.fee],
          ]);
          values_map.set(valued_wallet.native_coin.id, native_coin_value);
        }
      }

      for (const transfer of transaction.transfers.filter(
        (t) => t.type !== "nft",
      )) {
        if (
          transfer.to_address === valued_wallet.address ||
          transfer.from_address === valued_wallet.address
        ) {
          // como no es nft, asumo que es [SavedCoin]
          const saved_coin = transfer.coin as SavedCoin;

          if (transfer.type === "token") {
            decimal_places_map.set(
              saved_coin.id,
              saved_coin.contracts.find(
                (c) => c.blockchain === valued_wallet.blockchain,
              )!.decimal_place,
            );
          }

          const coin_map = values_map.get(saved_coin.id);

          // Si es to, suma. Si es from, resta
          const transfer_value =
            transfer.to_address === valued_wallet.address
              ? transfer.value
              : -transfer.value;

          if (coin_map) {
            const current_value = coin_map.get(transaction_time_key) ?? 0n;
            coin_map.set(transaction_time_key, current_value + transfer_value);
          } else {
            const coin_value = new Map<number, bigint>([
              [transaction_time_key, transfer_value],
            ]);
            values_map.set(saved_coin.id, coin_value);
          }
        }
      }
    }

    const balance_change_graph: ValueChangeGraph = [];
    // Listo los mapeos.
    // Ahora por cada coin, consigo su lista de timestamps (que son las keys del map), pido las candelas y calculo el value_usd
    for (const [coin_id, time_value_map] of values_map) {
      const is_native_coin = coin_id === valued_wallet.native_coin.id;
      const timestamps: Date[] = [];
      for (const num of time_value_map.keys()) {
        timestamps.push(new Date(num));
      }

      const candles = await this.coinsService.getCandlesByDateList(
        granularity,
        coin_id,
        timestamps,
      );

      const decimal_places = decimal_places_map.get(coin_id)!;

      // Pongo todos los valores conseguidos en la lista, despues hago agregación de fechas
      const values_to_insert: ValueChangeGraph = timestamps.map((timestamp) => {
        const value = time_value_map.get(
          this.getTimeKey(timestamp, granularity),
        )!;

        const price = candles.find(
          (c) => c.timestamp.getTime() === timestamp.getTime(),
        )?.close;

        // Puede pasar que no esten las candles para esa [Coin]
        if (!price)
          throw Error(
            `Price not available for coin: ${coin_id} at time: ${timestamp}`,
          );

        const value_usd = price * (Number(value) / 10 ** decimal_places);

        return {
          timestamp,
          value_usd,
          value: is_native_coin ? value : 0n,
        };
      });

      balance_change_graph.push(...values_to_insert);
    }

    // Agrupo el grafico por fechas y listo
    const grouped_graph: ValueChangeGraph = balance_change_graph
      .reduce((acc, item) => {
        const time_object = acc.find(
          (a) => a.timestamp.getTime() === item.timestamp.getTime(),
        );

        if (time_object) {
          time_object.value += item.value;
          time_object.value_usd += item.value_usd;
        } else {
          acc.push(item);
        }

        return acc;
      }, [] as ValueChangeGraph)
      // Ordeno descendente por fecha
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    for (const balance of grouped_graph) {
      // Agarro el último valor añadido y le resto el balance de ese momento
      const last_added_value =
        value_change_graph[value_change_graph.length - 1]!;
      value_change_graph.push({
        timestamp: balance.timestamp,
        value: last_added_value.value - balance.value,
        value_usd: last_added_value.value_usd - balance.value_usd,
      });
    }

    return value_change_graph;
  }

  // /** Genera un gráfico a través del tiempo del valor de una [Coin] en una [Wallet]  */
  // private async getCoinValueChangeGraph(
  //   coined_wallet: CoinedWallet,
  //   coin_id: number,
  // ): Promise<ValueChangeGraph> {}
}
