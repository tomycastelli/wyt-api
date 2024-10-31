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
import {
  type BlockchainsName,
  blockchains,
  calculateFiatValue,
  formatBlockchainValue,
  generateFilledDateRange,
} from "./vars.js";
import type {
  CoinedTransaction,
  CoinedTransfer,
  SavedWallet,
  Transaction,
  ValueChangeGraph,
  ValuedSavedWallet,
  ValuedTransaction,
  ValuedTransfer,
  ValuedWallet,
  ValuedWalletCoin,
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
    _stream_webhook_url: string,
  ): Promise<{
    valued_wallet: ValuedSavedWallet;
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

    const { valued_wallet, new_coins } =
      await this.getValuedWallet(wallet_data);

    // La guardo
    const { id, last_update } =
      await this.walletsRepository.saveWallet(valued_wallet);

    // // La añado al Stream
    // await this.addWalletToStream(
    //   { ...wallet_data, id, last_update },
    //   stream_webhook_url,
    // );

    return {
      valued_wallet: {
        id,
        last_update,
        ...valued_wallet,
      },
      new_coins,
    };
  }

  public async addWalletToStream(
    saved_wallet: SavedWallet,
    stream_webhook_url: string,
  ): Promise<void> {
    // Si estoy en prod y el ecosistema es Ethereum, añado la Wallet al stream
    const ecosystem = blockchains[saved_wallet.blockchain].ecosystem;

    if (process.env.NODE_ENV === "production" && ecosystem === "ethereum") {
      // Me fijo si ya existe un stream de esta blockchain
      const streams = await this.walletsProvider.getAllStreams();
      const this_blockchain_streams = streams.filter(
        (s) => s.blockchain === saved_wallet.blockchain,
      );

      if (this_blockchain_streams.length > 0) {
        // Añado la [Wallet] address al stream
        await this.walletsProvider.addAddressToStreams(
          this_blockchain_streams.map((s) => s.id),
          saved_wallet.address,
        );
      } else {
        // Lo creo
        const streams = await this.walletsProvider.createStreams(
          stream_webhook_url,
          `${saved_wallet.blockchain} + -transactions`,
          saved_wallet.blockchain,
          saved_wallet.blockchain,
        );

        // Añado la [Wallet] address al stream
        await this.walletsProvider.addAddressToStreams(
          streams.map((s) => s.id),
          saved_wallet.address,
        );
      }
    }
  }

  public async getTransactionsByWallet(
    address: string,
    blockchain: BlockchainsName,
    page: number,
    from_date: Date | undefined,
    to_date: Date | undefined,
  ): Promise<ValuedTransaction[]> {
    // Consigo las [Transaction]s
    const transaction_data = await this.walletsRepository.getTransactions(
      address,
      blockchain,
      page,
      from_date,
      to_date,
    );
    const { valued_transactions } = await this.getValuedTransactions(
      transaction_data,
      blockchain,
    );

    return valued_transactions;
  }

  public async walletExists(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<boolean> {
    return this.walletsRepository.walletExists(address, blockchain);
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

  public async getValuedWalletData(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<ValuedSavedWallet | undefined> {
    // Consigo la [Wallet]
    const saved_wallet = await this.walletsRepository.getWallet(
      address,
      blockchain,
    );
    if (!saved_wallet) return undefined;

    const { valued_wallet } = await this.getValuedWallet(saved_wallet);

    return {
      id: saved_wallet.id,
      last_update: saved_wallet.last_update,
      ...valued_wallet,
    };
  }

  public async getValuedWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
    ids: number[] | undefined,
    include_nfts: boolean,
  ): Promise<ValuedSavedWallet[]> {
    const saved_wallets = await this.walletsRepository.getWalletsByBlockchain(
      blockchain,
      wallets_page,
      ids,
      include_nfts,
    );

    // Me quedo con las primeras 10 coins con mayor porcentaje de la wallet
    const valued_wallets: ValuedSavedWallet[] = [];
    for (const sw of saved_wallets) {
      const valued_wallet = await this.getValuedWallet(sw);

      valued_wallets.push({
        id: sw.id,
        last_update: sw.last_update,
        ...valued_wallet.valued_wallet,
        coins: valued_wallet.valued_wallet.coins.slice(0, 10),
      });
    }

    return valued_wallets.sort((a, b) => b.total_value_usd - a.total_value_usd);
  }

  public async getWalletsByBlockchain(
    blockchain: BlockchainsName,
    page: number,
  ): Promise<SavedWallet[]> {
    const saved_wallets = await this.walletsRepository.getWalletsByBlockchain(
      blockchain,
      page,
      undefined,
      false,
    );

    return saved_wallets;
  }

  /** Consigue las dos puntas de tiempo del historial de una [Wallet] y devuelve los chunks de tiempo. \
  A su vez, guarda la fecha de la primera transacción hecha por la [Wallet] */
  public async getHistoryTimeChunks(
    address: string,
    blockchain: BlockchainsName,
    chunk_amount: number,
  ): Promise<{
    chunks: { from_block: number; to_block: number }[];
    first_date: Date;
  }> {
    // Primero veo la primera y última transacción hecha por la Wallet
    const { first_block, last_block, first_date } =
      await this.walletsProvider.getWalletTimes(address, blockchain);

    const chunks: { from_block: number; to_block: number }[] = [];

    const total_blocks = last_block - first_block + 1;
    const chunk_size = Math.floor(total_blocks / chunk_amount);
    let current_block = first_block;

    for (let i = 0; i < chunk_amount; i++) {
      const from_block = current_block;
      let to_block = from_block + chunk_size - 1;

      // Ensure the last chunk extends to the last_block
      if (i === chunk_amount - 1) {
        to_block = last_block;
      }

      chunks.push({ from_block, to_block });
      current_block = to_block + 1;
    }

    return { chunks, first_date };
  }

  /** Consigue el historial de transacciones de una [Wallet] dada una ventana de tiempo */
  public async getTransactionHistory(
    address: string,
    blockchain: BlockchainsName,
    from_block: number,
    to_block: number,
    loop_cursor: string | undefined,
  ): Promise<{
    transactions: Transaction[];
    cursor: string | undefined;
  }> {
    const { transactions, cursor } =
      await this.walletsProvider.getTransactionHistory(
        address,
        blockchain,
        from_block,
        to_block,
        loop_cursor,
      );
    return { transactions, cursor };
  }

  /** Terminar el backfill con los pasos correspondientes */
  public async changeBackfillStatus(
    address: string,
    blockchain: BlockchainsName,
    new_status: "complete" | "active" | "pending",
    first_date?: Date,
  ): Promise<void> {
    // Si llego hasta acá sin tirar error, actualizo su status
    await this.walletsRepository.updateWalletBackfillStatus(
      address,
      blockchain,
      new_status,
      first_date,
    );
  }

  /** Guarda [Transaction]s y devuelve las nuevas */
  public async saveTransactions(
    transactions: Transaction[],
    blockchain: BlockchainsName,
  ): Promise<{ new_coins: SavedCoin[] }> {
    const { coined_transactions, new_coins } = await this.getCoinedTransactions(
      transactions,
      blockchain,
    );

    await this.walletsRepository.saveTransactions(
      coined_transactions,
      blockchain,
    );

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

  public async handleFailedWebhooks(): Promise<{
    new_coins: SavedCoin[];
    webhooks_handled: number;
  }> {
    const new_coins: SavedCoin[] = [];
    let webhooks_handled = 0;
    const failed_webhooks = await this.walletsProvider.getFailedWebhooks();

    for (const webhook of failed_webhooks) {
      const result = await this.handleWebhookTransaction(
        webhook.body,
        webhook.blockchain,
      );
      if (result) {
        webhooks_handled++;
        new_coins.push(...result.new_coins);
      }
    }

    return { new_coins, webhooks_handled };
  }

  public async getWalletsToUpdate(
    hourly_frequency: 0.25 | 0.5 | 1 | 2 | 4 | 24,
  ): Promise<SavedWallet[]> {
    // Definimos que [Wallet]s actualizar segun la frecuencia pasada
    // Las frecuencias estan en txs/hora
    // quiero en promedio conseguir entre 10 y 30 transacciones al actualizar
    let from_frequency: number;
    let to_frequency: number | null;

    switch (hourly_frequency) {
      case 0.25:
        from_frequency = 30;
        to_frequency = null;
        break;
      case 0.5:
        from_frequency = 15;
        to_frequency = 30;
        break;
      case 1:
        from_frequency = 5;
        to_frequency = 15;
        break;
      case 2:
        from_frequency = 1;
        to_frequency = 5;
        break;
      case 4:
        from_frequency = 0.5;
        to_frequency = 1;
        break;
      case 24:
        from_frequency = 0;
        to_frequency = 0.5;
        break;
    }

    const wallets =
      await this.walletsRepository.getWalletsByTransactionFrequency(
        from_frequency,
        to_frequency,
      );
    return wallets;
  }

  /** Actualiza los token holdings de la [Wallet] y consigue nuevas transacciones vinculadas.
  El cambio del estado se hace directo sin recurrir a las [Transaction]s. */
  public async updateWallet(
    saved_wallet: SavedWallet,
  ): Promise<{ new_coins: SavedCoin[] } | null> {
    const updated_wallet_data = await this.walletsProvider.getWallet(
      saved_wallet.address,
      saved_wallet.blockchain,
    );

    if (!updated_wallet_data) return null;

    // Consigo las nuevas transacciones
    const new_transactions =
      await this.walletsProvider.getAllTransactionsFromDate(
        saved_wallet,
        saved_wallet.last_update,
      );

    // Actualizo el transaction_frequency. Es txs/hour
    const hours_range =
      Math.abs(new Date().getTime() - saved_wallet.last_update.getTime()) /
      3.6e6;
    const transaction_frequency = Number(
      (new_transactions.length / hours_range).toFixed(6),
    );

    // Actualizo sus posesiones y su transaction_frequency
    const { valued_wallet, new_coins: new_wallet_coins } =
      await this.getValuedWallet(updated_wallet_data);
    await this.walletsRepository.updateWallet(
      saved_wallet.id,
      valued_wallet,
      transaction_frequency,
    );

    const { coined_transactions, new_coins: new_tx_coins } =
      await this.getCoinedTransactions(
        new_transactions,
        saved_wallet.blockchain,
      );

    // Guardo las nuevas transacciones
    await this.walletsRepository.saveTransactions(
      coined_transactions,
      saved_wallet.blockchain,
    );

    return { new_coins: [...new_wallet_coins, ...new_tx_coins] };
  }

  public async getPendingWallets(): Promise<SavedWallet[]> {
    const pending_wallets = await this.walletsRepository.getPendingWallets();

    return pending_wallets;
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

    const addresses_to_fetch: string[] = [];

    for (const tx of transaction_data) {
      for (const tr of tx.transfers) {
        if (tr.type === "token") addresses_to_fetch.push(tr.coin_address!);
      }
    }

    const available_coins = await this.coinsService.getCoinsByAddress(
      addresses_to_fetch,
      blockchain,
    );

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

          const value_usd = calculateFiatValue(
            tr.value,
            native_coin!.price,
            decimal_places,
          );

          valued_transfers.push({ ...tr, coin: native_coin!, value_usd });
        } else {
          // Es token. Si la coin no esta en la lista de disponibles, descarto la transfer
          const coin = available_coins.find((a) =>
            a.saved_coin.contracts.some(
              (c) =>
                c.contract_address.toLowerCase() ===
                tr.coin_address?.toLowerCase(),
            ),
          )?.saved_coin;
          if (!coin) continue;

          const decimal_places = coin.contracts.find(
            (co) => co.blockchain === tx.blockchain,
          )!.decimal_place;

          const value_usd = calculateFiatValue(
            tr.value,
            coin.price,
            decimal_places,
          );

          valued_transfers.push({ ...tr, coin: coin, value_usd });
        }
      }

      // Si no hay transfers despues de buscar las Coins, no agrego la tx
      if (valued_transfers.length === 0) continue;

      // Calculo el valor en USD del fee
      const decimal_places = blockchains[tx.blockchain].decimal_places;
      const fee_usd = calculateFiatValue(
        tx.fee,
        native_coin!.price,
        decimal_places,
      );

      valued_transactions.push({
        hash: tx.hash,
        blockchain: tx.blockchain,
        block_timestamp: tx.block_timestamp,
        from_address: tx.from_address,
        to_address: tx.to_address,
        fee: tx.fee,
        fee_usd,
        summary: tx.summary,
        transfers: valued_transfers,
      });
    }

    return {
      valued_transactions,
      new_coins: available_coins
        .filter((c) => c.is_new)
        .map((c) => c.saved_coin),
    };
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

    const addresses_to_fetch: string[] = [];

    for (const tx of transaction_data) {
      for (const tr of tx.transfers) {
        if (tr.type === "token") addresses_to_fetch.push(tr.coin_address!);
      }
    }

    const available_coins = await this.coinsService.getCoinsByAddress(
      addresses_to_fetch,
      blockchain,
    );

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
          // Es token. Si la coin no esta en la lista de disponibles, descarto la transfer
          const coin = available_coins.find((a) =>
            a.saved_coin.contracts.some(
              (c) =>
                c.contract_address.toLowerCase() ===
                tr.coin_address?.toLowerCase(),
            ),
          )?.saved_coin;
          if (!coin) continue;

          valued_transfers.push({ ...tr, coin: coin });
        }
      }

      // Si no hay transfers despues de buscar las Coins, no agrego la tx
      if (valued_transfers.length === 0) continue;

      coined_transactions.push({
        hash: tx.hash,
        blockchain: tx.blockchain,
        block_timestamp: tx.block_timestamp,
        from_address: tx.from_address,
        to_address: tx.to_address,
        fee: tx.fee,
        summary: tx.summary,
        transfers: valued_transfers,
      });
    }

    return {
      coined_transactions,
      new_coins: available_coins
        .filter((c) => c.is_new)
        .map((c) => c.saved_coin),
    };
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

    const addresses_to_fetch: string[] = [];

    for (const coin of wallet_data.coins) {
      if (!coin.token_id) addresses_to_fetch.push(coin.coin_address);
    }

    const available_coins = await this.coinsService.getCoinsByAddress(
      addresses_to_fetch,
      wallet_data.blockchain,
    );

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
        // Es token. Si la coin no esta en la lista de disponibles, descarto la transfer
        const coin = available_coins.find((a) =>
          a.saved_coin.contracts.some(
            (ct) =>
              ct.contract_address.toLowerCase() ===
              c.coin_address.toLowerCase(),
          ),
        )?.saved_coin;
        if (!coin) continue;

        // Agarro los decimales que tiene en esta red esta [Coin]
        const decimal_place = coin.contracts.find(
          (c) => c.blockchain === wallet_data.blockchain,
        )!.decimal_place;

        // El valor en la wallet dividido por los decimales en la blockchain multiplicado por el precio guardado
        const value_usd = calculateFiatValue(
          c.value,
          coin.price,
          decimal_place,
        );

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

    const native_value_usd = calculateFiatValue(
      wallet_data.native_value,
      native_coin!.price,
      decimal_places,
    );

    total_value_usd += native_value_usd;

    // Calculo porcentajes y ordeno de mayor a menor
    const valued_wallet_coins: ValuedWalletCoin[] = partial_valued_wallet_coins
      .map((c) => ({
        ...c,
        percentage_in_wallet: Number(
          ((c.value_usd / total_value_usd) * 100).toFixed(4),
        ),
      }))
      .sort((a, b) => b.percentage_in_wallet - a.percentage_in_wallet);

    const valued_wallet: ValuedWallet = {
      address: wallet_data.address,
      blockchain: wallet_data.blockchain,
      alias: wallet_data.alias,
      backfill_status: wallet_data.backfill_status,
      first_transfer_date: wallet_data.first_transfer_date,
      native_value: wallet_data.native_value,
      formated_native_value: formatBlockchainValue(
        wallet_data.native_value,
        decimal_places,
      ),
      transaction_frequency: wallet_data.transaction_frequency,
      native_value_usd,
      total_value_usd,
      native_coin: native_coin!,
      coins: valued_wallet_coins,
    };

    return {
      valued_wallet,
      new_coins: available_coins
        .filter((c) => c.is_new)
        .map((c) => c.saved_coin),
    };
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
    time_range: "day" | "week" | "month" | "year",
  ): Date {
    const newDate = new Date(date.getTime());

    switch (time_range) {
      case "day":
        newDate.setUTCDate(newDate.getUTCDate() - 1);
        newDate.setUTCMinutes(0, 0, 0);
        break;
      case "week":
        newDate.setUTCDate(newDate.getUTCDate() - 7);
        newDate.setUTCHours(0, 0, 0, 0);
        break;
      case "month":
        newDate.setUTCMonth(newDate.getUTCMonth() - 1);
        newDate.setUTCHours(0, 0, 0, 0);
        break;
      case "year":
        newDate.setUTCFullYear(newDate.getUTCFullYear() - 1);
        newDate.setUTCMonth(newDate.getUTCMonth(), 1);
        newDate.setUTCHours(0, 0, 0, 0);
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
    valued_wallet: ValuedSavedWallet,
    time_range: "day" | "week" | "month",
  ) {
    // Necesito saber las posesiones de la [Wallet] en el rango dado
    // Para eso veo las posesiones actuales y las transacciones que sucedieron hasta el fin del rango
    const current_date = new Date();

    const granularity = time_range === "day" ? "hourly" : "daily";

    // Genero un rango relleno con la granularidad necesaria
    const full_date_range = generateFilledDateRange(
      this.subtractTime(current_date, time_range),
      current_date,
      granularity,
    ).sort((a, b) => b - a);

    console.time("txDataQuery");
    const transactions = await this.walletsRepository.getTransactions(
      valued_wallet.address,
      valued_wallet.blockchain,
      // Para tener todas las transacciones en ese rango
      0,
      this.subtractTime(current_date, time_range),
      current_date,
    );
    console.timeEnd("txDataQuery");

    // Veo como fue el saldo neto de los valores de las [Coin]s involucradas en [Transaction]s desde ahora hasta el 'from_date'
    /** Map => coin_id: { time_key: value } */
    const net_changes_map: Map<number, Map<number, bigint>> = new Map();

    /** Map => coin_id: decimal_places */
    const decimal_places_map: Map<number, number> = new Map();

    decimal_places_map.set(
      valued_wallet.native_coin.id,
      blockchains[valued_wallet.blockchain].decimal_places,
    );

    console.time("Coining transactions");
    // Asumo que no hay [Coin]s nuevas porque ya existen las transacciones en el sistema
    const { coined_transactions } = await this.getCoinedTransactions(
      transactions,
      valued_wallet.blockchain,
    );
    console.timeEnd("Coining transactions");

    for (const transaction of coined_transactions) {
      const transaction_time_key = this.getTimeKey(
        new Date(transaction.block_timestamp),
        granularity,
      );

      // Cargo la fee en la native coin
      if (
        transaction.from_address?.toLowerCase() ===
        valued_wallet.address.toLowerCase()
      ) {
        const native_coin_map = net_changes_map.get(
          valued_wallet.native_coin.id,
        );
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
          net_changes_map.set(valued_wallet.native_coin.id, native_coin_value);
        }
      }

      for (const transfer of transaction.transfers.filter(
        (t) => t.type !== "nft",
      )) {
        if (
          transfer.to_address?.toLowerCase() ===
            valued_wallet.address.toLowerCase() ||
          transfer.from_address?.toLowerCase() ===
            valued_wallet.address.toLowerCase()
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

          const coin_map = net_changes_map.get(saved_coin.id);

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
            net_changes_map.set(saved_coin.id, coin_value);
          }
        }
      }
    }

    const missing_prices: { timestamp: Date; coin_id: number }[] = [];

    /** coin_id: value */
    const current_coin_values: Map<number, bigint> = new Map(
      valued_wallet.coins
        .filter((c) => !c.token_id)
        .map((c) => [c.coin.id, c.value]),
    );
    // Añado el native value como uno más
    current_coin_values.set(
      valued_wallet.native_coin.id,
      valued_wallet.native_value,
    );

    // Añado al mapa de cambios netos las coins que tiene la wallet que no tuvieron transacciones en el rango buscado
    for (const [coin_id, _] of current_coin_values) {
      if (!net_changes_map.get(coin_id)) {
        net_changes_map.set(coin_id, new Map());
        // Añado sus decimales al map de decimales
        const coin = await this.coinsService.getCoinById(coin_id);
        decimal_places_map.set(
          coin_id,
          coin_id === valued_wallet.native_coin.id
            ? blockchains[valued_wallet.blockchain].decimal_places
            : coin!.contracts.find(
                (c) => c.blockchain === valued_wallet.blockchain,
              )!.decimal_place,
        );
      }
    }

    console.time("Calculating prices");
    const coins_graphs: {
      timestamp: number;
      value: bigint;
      value_usd: number;
      coin_id: number;
    }[] = [];
    // Listo los mapeos.
    // Voy a generar ahora una lista del tipo [ValueChangeGraph] con el balance de cada [Coin] en todo el rango de dias.
    // Vamos de mas reciente a mas viejo. Si no hubo movimientos ese dia, agarro el balance del anterior (el dia o hora mas adelante)
    // Ahora por cada coin, consigo su lista de timestamps (que son las keys del map), pido las candelas y calculo el value_usd
    for (const [coin_id, time_value_map] of net_changes_map) {
      const this_coin_graph: {
        timestamp: number;
        value: bigint;
        value_usd: number;
      }[] = [];
      const full_range_candles = await this.coinsService.getCandlesByDateList(
        granularity,
        coin_id,
        full_date_range.map((d) => new Date(d)),
      );

      // Voy por cada timestamp y hago el grafico para esa coin
      for (const timestamp of full_date_range) {
        const price_this_day = full_range_candles.find(
          (c) => c.timestamp.getTime() === timestamp,
        )?.close;
        if (!price_this_day) {
          missing_prices.push({ timestamp: new Date(timestamp), coin_id });
          // No calculo para ese día
          continue;
        }

        const value_change_this_day = time_value_map.get(timestamp);
        const current_value = current_coin_values.get(coin_id);

        if (value_change_this_day) {
          // Actualizo el balance
          // Si no hay current_value es porque actualmente el balance es 0 pero hubo transacciones con esa coin
          const new_balance = current_value
            ? current_value - value_change_this_day
            : -value_change_this_day;
          // Actualizo en el map de balances para el loop
          current_coin_values.set(coin_id, new_balance);

          this_coin_graph.push({
            timestamp,
            value: new_balance,
            value_usd: calculateFiatValue(
              new_balance,
              price_this_day,
              decimal_places_map.get(coin_id)!,
            ),
          });
        } else {
          if (!current_value)
            throw Error(
              `current_value not present but neither value_change_this_day. Transations: ${coined_transactions}. Current state: ${current_coin_values}`,
            );

          // Uso el balance en su estado actual por con el precio del día de hoy
          this_coin_graph.push({
            timestamp,
            value: current_value,
            value_usd: calculateFiatValue(
              current_value,
              price_this_day,
              decimal_places_map.get(coin_id)!,
            ),
          });
        }
      }

      // Pusheo al grafico unificado de todas las [Coin]s
      coins_graphs.push(...this_coin_graph.map((c) => ({ ...c, coin_id })));
    }
    console.timeEnd("Calculating prices");

    // Ahora que tengo eso, agrupo por fecha sumando sus valores en usd de cada [Coin]
    const unified_graph = coins_graphs.reduce((acc, item) => {
      const acc_date = acc.find(
        (a) => a.timestamp.getTime() === item.timestamp,
      );
      if (!acc_date) {
        acc.push({
          timestamp: new Date(item.timestamp),
          value_usd: item.value_usd,
        });
      } else {
        acc_date.value_usd += item.value_usd;
      }

      return acc;
    }, [] as ValueChangeGraph);

    if (unified_graph.length > 0) {
      // Guardo las valuaciones
      await this.walletsRepository.saveWalletValuations(
        unified_graph.map((ug) => ({
          wallet_id: valued_wallet.id,
          timestamp: ug.timestamp,
          value_usd: ug.value_usd,
        })),
      );
    }

    return { unified: unified_graph, coins: coins_graphs, missing_prices };
  }

  // /** Genera un gráfico a través del tiempo del valor de una [Coin] en una [Wallet]  */
  // private async getCoinValueChangeGraph(
  //   coined_wallet: CoinedWallet,
  //   coin_id: number,
  // ): Promise<ValueChangeGraph> {}
}
