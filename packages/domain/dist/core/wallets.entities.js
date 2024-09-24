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
    fee: "bigint",
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
