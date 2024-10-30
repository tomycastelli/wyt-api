import { type } from "arktype";
import { savedCoinType, savedNftType } from "./coins.entities.js";
import { EveryBlockainsName } from "./vars.js";

// Things to think:
// A wallet or transaction might involve coins which aren't in the system what then? Add them somehow?
// Maybe use the address to ask for this token data and add it to the coin list

const blockchain = type(["===", ...EveryBlockainsName]);

export const walletCoin = type({
  coin_address: "string",
  value: "bigint",
  // Si es NFT
  "token_id?": "number",
});

export const coinedWalletCoin = walletCoin.merge({
  coin: type.enumerated(savedCoinType.infer, savedNftType.infer),
});

export const valuedWalletCoin = coinedWalletCoin.merge({
  value_usd: "number",
  percentage_in_wallet: "number",
});

export const walletType = type({
  address: "string",
  blockchain: blockchain,
  alias: "string|null",
  native_value: "bigint",
  formated_native_value: "number",
  coins: walletCoin.array(),
  first_transfer_date: "Date|null",
  backfill_status: "'pending'|'active'|'complete'",
  transaction_frequency: "number|null",
});

export const savedWalletType = walletType.merge({
  id: "number.integer",
  last_update: "Date",
});

export const coinedWalletType = walletType.merge({
  native_coin: savedCoinType,
  coins: coinedWalletCoin.array(),
});

export const valuedWalletType = coinedWalletType.merge({
  total_value_usd: "number",
  native_value_usd: "number",
  coins: valuedWalletCoin.array(),
});

export const valuedSavedWalletType = valuedWalletType.merge({
  id: "number",
  last_update: "Date",
});

export const transferType = type({
  type: "'native'|'token'|'nft'",
  value: "bigint",
  from_address: "string|null",
  to_address: "string|null",
  // Esto es si es un NFT
  token_id: "number|null",
  // Si es de tipo 'native', la coin es la nativa de la blockchain
  coin_address: "string|null",
});

export const coinedTransferType = transferType.merge({
  coin: type.enumerated(savedCoinType.infer, savedNftType.infer),
});

export const valuedTransferType = coinedTransferType.merge({
  value_usd: "number",
});

export const transactionType = type({
  blockchain: blockchain,
  hash: "string",
  block_timestamp: "Date",
  from_address: "string|null",
  to_address: "string|null",
  transfers: transferType.array(),
  fee: "bigint",
  summary: "string|null",
});

export const coinedTransactionType = transactionType.merge({
  transfers: coinedTransferType.array(),
});

export const valuedTransactionType = transactionType.merge({
  transfers: valuedTransferType.array(),
  fee_usd: "number",
});

export const valuedWalletWithTransactions = valuedWalletType.merge({
  transactions: valuedTransactionType.array(),
  id: "number.integer",
  last_update: "Date",
});

export const valueChangeGraph = type({
  timestamp: "Date",
  value_usd: "number",
}).array();

export const streamsType = type({
  id: "string",
  webhook_url: "string",
  description: "string",
  tag: "string",
  blockchain: blockchain,
});

export const streamsWithAddressType = streamsType.merge({
  addresses: "string[]",
});

/** # Un [Stream] que escucha transacciones de las [Wallets] */
export type Stream = typeof streamsType.infer;

/** # Un [Stream] con sus addresses */
export type StreamWithAddress = typeof streamsWithAddressType.infer;

/** # Un balance de alguna coin o nft de una wallet */
export type WalletCoin = typeof walletCoin.infer;

/** # Una wallet en una blockchain */
export type Wallet = typeof walletType.infer;

/** # Una [Wallet] guardada */
export type SavedWallet = typeof savedWalletType.infer;

/** # Una [Wallet] con las [Coin] integradas */
export type CoinedWallet = typeof coinedWalletType.infer;

/** # Una [Wallet] con su valor en USD y las [Coin] integradas */
export type ValuedWallet = typeof valuedWalletType.infer;

/** # Una [SavedWallet] con su valor en USD y las [Coin] integradas */
export type ValuedSavedWallet = typeof valuedSavedWalletType.infer;

/** # Una [WalletCoin] con la [Coin] integrada */
export type CoinedWalletCoin = typeof coinedWalletCoin.infer;

/** # Una [WalletCoin] con su valor en USD y la [Coin] integrada */
export type ValuedWalletCoin = typeof valuedWalletCoin.infer;

/** # Una transferencia dentro de una transacción */
export type Transfer = typeof transferType.infer;

/** # Una [Transfer] con la [Coin] integrada */
export type CoinedTransfer = typeof coinedTransferType.infer;

/** # Una [Transfer] con su valor en USD y la [Coin] integrada */
export type ValuedTransfer = typeof valuedTransferType.infer;

/** # Una transacción en una blockchain */
export type Transaction = typeof transactionType.infer;

/** # Una [Transaction] con [CoinedTransfer]s */
export type CoinedTransaction = typeof coinedTransactionType.infer;

/** # Una [Transaction] con [ValuedTransfer]s */
export type ValuedTransaction = typeof valuedTransactionType.infer;

/** # Una [Wallet] con sus transacciones valuadas */
export type ValuedWalletWithTransactions =
  typeof valuedWalletWithTransactions.infer;

/** # Un grafico basado en tiempo del cambio en balance y valor en USD de una [Wallet] o [Coin] */
export type ValueChangeGraph = typeof valueChangeGraph.infer;
