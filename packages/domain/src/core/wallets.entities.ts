import { type } from "arktype";
import { coinType, nftType, savedCoinType } from "./coins.entities";
import { EveryBlockainsName } from "./vars";

// Things to think:
// A wallet or transaction might involve coins which aren't in the system what then? Add them somehow?
// Maybe use the address to ask for this token data and add it to the coin list

export const walletCoin = type({
  coin_address: "string",
  value: "bigint",
});

export const coinedWalletCoin = walletCoin.merge({
  coin: savedCoinType,
});

export const valuedWalletCoin = coinedWalletCoin.merge({
  value_usd: "number",
  percentage_in_wallet: "number",
});

export const walletType = type({
  address: "string",
  blockchain: ["===", ...EveryBlockainsName],
  alias: "string|null",
  native_value: "bigint",
  coins: walletCoin.array(),
  first_transfer_date: "Date|null",
  backfill_status: "'pending'|'complete'",
});

export const coinedWalletType = walletType.merge({
  native_coin: coinType,
  coins: coinedWalletCoin.array(),
});

export const valuedWalletType = coinedWalletType.merge({
  total_value_usd: "number",
  native_value_usd: "number",
  coins: valuedWalletCoin.array(),
});

export const transactionType = type({
  blockchain: ["===", ...EveryBlockainsName],
  hash: "string",
  block_timestamp: "Date",
  type: "'native'|'erc20'|'nft'",
  // Esto es si es un NFT
  token_id: "number|null",
  // Si es de tipo 'native', la coin es la nativa de la blockchain
  "coin_address?": "string",
  value: "bigint",
  from_address: "string",
  to_address: "string",
  summary: "string",
});

export const coinedTransactionType = transactionType.merge({
  value_usd: "number",
  coin: type.enumerated(coinType.infer, nftType.infer),
});

export const coinedWalletWithTransactions = valuedWalletType.merge({
  transactions: coinedTransactionType.array(),
});

/** # Una [Wallet] en una blockchain */
export type Wallet = typeof walletType.infer;

/** # Una [Wallet] con las [Coin] integradas */
export type CoinedWallet = typeof coinedWalletType.infer;

/** # Una [Wallet] con su valor en USD y las [Coin] integradas */
export type ValuedWallet = typeof valuedWalletType.infer;

/** # Una [WalletCoin] con la [Coin] integrada */
export type CoinedWalletCoin = typeof coinedWalletCoin.infer;

/** # Una transacción en una blockchain */
export type Transaction = typeof transactionType.infer;

/** # Una [WalletCoin] con su valor en USD y la [Coin] integrada */
export type ValuedWalletCoin = typeof valuedWalletCoin.infer;

/** # Una transferencia con su valor en USD en su momento */
export type CoinedTransaction = typeof coinedTransactionType.infer;

/** # Una [Wallet] con sus transacciones valuadas */
export type CoinedWalletWithTransactions =
  typeof coinedWalletWithTransactions.infer;
