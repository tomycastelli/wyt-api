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
    block_height: "number",
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
      transaction_frequency: null,
      native_value: BigInt(
        parsedResponse.chain_stats.funded_txo_sum -
          parsedResponse.chain_stats.spent_txo_sum,
      ),
    };

    return wallet;
  }

  async getWalletTimes(
    wallet_data: Wallet,
  ): Promise<{ first_block: number; last_block: number; first_date: Date }> {
    let is_first_time = true;
    const limit = 25;
    let last_seen_txid = "";

    let first_block = 0;
    let last_block = 0;
    let first_date = new Date();

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 250));

      const response = await fetch(
        `${this.api_url}/address/${wallet_data.address}/txs/chain/${last_seen_txid}`,
      ).then((res) => res.json());

      const parsedResponse = txInfoType(response);

      if (parsedResponse instanceof type.errors) throw parsedResponse;
      if (parsedResponse.length === 0) break;

      if (is_first_time) {
        first_block = parsedResponse[0].status.block_height;
        first_date = new Date(parsedResponse[0].status.block_time * 1000);
        is_first_time = false;
      }

      last_block =
        parsedResponse[parsedResponse.length - 1].status.block_height;

      last_seen_txid = parsedResponse[parsedResponse.length - 1].txid;

      if (parsedResponse.length < limit) break;
    }

    return { first_block, last_block, first_date };
  }

  async getTransactionHistory(
    address: string,
    _blockchain: BlockchainsName,
    _from_block: number,
    _to_block: number,
    loop_cursor: string | undefined,
  ): Promise<{ transactions: Transaction[]; cursor: string | undefined }> {
    await new Promise((resolve) => setTimeout(resolve, 250));

    const response = await fetch(
      `${this.api_url}/address/${address}/txs/chain/${loop_cursor ? loop_cursor : ""}`,
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
    const limit = 25;
    let last_seen_txid = "";

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const response = await fetch(
        `${this.api_url}/address/${wallet_data.address}/txs/chain/${last_seen_txid}`,
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
      if (mapped_transactions.length === limit) {
        last_seen_txid = parsedResponse[parsedResponse.length - 1].txid;
      } else {
        break;
      }

      transactions.push(...mapped_transactions);
    }

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
