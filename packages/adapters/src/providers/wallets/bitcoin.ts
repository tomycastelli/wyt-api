import type {
  BlockchainsName,
  Transaction,
  Transfer,
  Wallet,
  WalletsProvider,
} from "@repo/domain";
import { type } from "arktype";

const addrInfoType = type({
  address: "string",
  chain_stats: {
    funded_txo_sum: "number",
    spent_txo_sum: "number",
  },
});

const txInfoType = type({
  txid: "string",
  vin: type({
    prevout: {
      scriptpubkey_address: "string",
      value: "number",
    },
  }).array(),
  vout: type({
    "scriptpubkey_address?": "string",
    value: "number",
  }).array(),
  fee: "number",
  status: {
    block_time: "number",
  },
}).array();

type TxInfo = typeof txInfoType.infer;

export class BitcoinProvider implements WalletsProvider {
  private api_url = "https://blockstream.info/api";

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<Wallet | null> {
    const response = await fetch(`${this.api_url}/address/${address}`);

    if (!response.ok) return null;

    const parsedResponse = addrInfoType(await response.json());

    if (parsedResponse instanceof type.errors) throw parsedResponse;

    const wallet: Wallet = {
      address,
      blockchain,
      alias: null,
      backfill_status: "pending",
      coins: [],
      first_transfer_date: null,
      native_value: BigInt(
        parsedResponse.chain_stats.funded_txo_sum -
          parsedResponse.chain_stats.spent_txo_sum,
      ),
    };

    return wallet;
  }

  async getRecentTransactions(wallet_data: Wallet): Promise<Transaction[]> {
    const response = await fetch(
      `${this.api_url}/address/${wallet_data.address}/txs/chain`,
    ).then((res) => res.json());

    const parsedResponse = txInfoType(response);

    if (parsedResponse instanceof type.errors) throw parsedResponse;

    const transactions = this.mapTransactionData(parsedResponse.slice(0, 10));

    return transactions;
  }

  async getWalletTimes(
    wallet_data: Wallet,
  ): Promise<{ first_transaction: Date; last_transaction: Date }> {
    let is_first_time = true;
    let limit = 25;
    let last_seen_txid = "";

    let first_transaction = new Date();
    let last_transaction = new Date();

    while (true) {
      // Esperamos 1 segundo
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await fetch(
        `${this.api_url}/address/${wallet_data.address}/txs/chain/${last_seen_txid}`,
      ).then((res) => res.json());

      const parsedResponse = txInfoType(response);

      if (parsedResponse instanceof type.errors) throw parsedResponse;
      if (parsedResponse.length === 0) break;

      if (is_first_time) {
        first_transaction = new Date(
          parsedResponse[0].status.block_time * 1000,
        );
        is_first_time = false;
      }

      last_transaction = new Date(
        parsedResponse[parsedResponse.length - 1].status.block_time * 1000,
      );

      last_seen_txid = parsedResponse[parsedResponse.length - 1].txid;

      if (parsedResponse.length < limit) break;
    }

    return { first_transaction, last_transaction };
  }

  async getTransactionHistory(
    wallet_data: Wallet,
    from_date: Date,
    to_date: Date,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    // Esperamos medio segundo
    await new Promise((resolve) => setTimeout(resolve, 500));

    const response = await fetch(
      `${this.api_url}/address/${wallet_data.address}/txs/chain/${loop_cursor ? loop_cursor : ""}`,
    ).then((res) => res.json());

    const parsedResponse = txInfoType(response);

    if (parsedResponse instanceof type.errors) throw parsedResponse;

    if (parsedResponse.length === 0)
      return { transactions: [], cursor: undefined };

    const mapped_transactions = this.mapTransactionData(parsedResponse);

    // Como es ineficiente dada la API de Bitcoin que tenemos
    // Voy a ignorar las fechas
    return {
      transactions: mapped_transactions,
      cursor: parsedResponse[parsedResponse.length - 1].txid,
    };
  }

  async getAllTransactionsFromDate(
    wallet_data: Wallet,
    from_date: Date,
  ): Promise<Transaction[]> {
    const transactions: Transaction[] = [];

    let has_next_page = false;

    do {
      const response = await fetch(
        `https://blockchain.info/rawaddr/${wallet_data.address}`,
      ).then((res) => res.json());

      const parsedResponse = txInfoType(response);

      if (parsedResponse instanceof type.errors) throw parsedResponse;

      // Quiero solo las que esten despues de cierta fecha
      const mapped_transactions = this.mapTransactionData(
        parsedResponse.filter(
          (t) => new Date(t.status.block_time! * 1000) > from_date,
        ),
      );
      // Si despues del filtrado siguen siendo 25 transacciones, entonces tengo que buscar mas atrás
      if (mapped_transactions.length === 25) {
        has_next_page = true;
      } else {
        has_next_page = false;
      }

      transactions.push(...mapped_transactions);
    } while (has_next_page === true);

    return transactions.filter((tx) => tx.block_timestamp >= from_date);
  }

  mapTransactionData(transactions: TxInfo): Transaction[] {
    const mapped_transactions: Transaction[] = transactions.map((tx) => {
      const transfers: Transfer[] = [];

      for (const input of tx.vin) {
        transfers.push({
          from_address: input.prevout.scriptpubkey_address,
          to_address: null,
          value: BigInt(input.prevout.value),
          type: "native",
          coin_address: null,
          token_id: null,
        });
      }
      for (const output of tx.vout.filter((o) => o.scriptpubkey_address)) {
        transfers.push({
          to_address: output.scriptpubkey_address!,
          from_address: null,
          value: BigInt(output.value),
          type: "native",
          coin_address: null,
          token_id: null,
        });
      }

      return {
        block_timestamp: new Date(tx.status.block_time * 1000),
        blockchain: "bitcoin",
        // Las fees son mas implicitas en la red bitcoin y ya con poner los inputs en transfers estamos
        fee: 0n,
        // No existe un solo from_address o to_address
        from_address: null,
        to_address: null,
        hash: tx.txid,
        summary: null,
        transfers,
      };
    });

    return mapped_transactions;
  }
}
