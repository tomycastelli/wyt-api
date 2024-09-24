import { type } from "arktype";
import { EveryBlockainsName, providers } from "./vars";
/// Las entidades que conforman a la aplicacion
const coinMarketDataType = type({
    market_cap: "number",
    price: "number",
    price_change_percentage_24h: "number",
    price_change_24h: "number",
    ath: "number",
    name: "string",
});
export const coinType = coinMarketDataType.merge({
    name: "string",
    symbol: "string",
    provider: type.enumerated(...providers),
    contracts: [
        {
            blockchain: ["===", ...EveryBlockainsName],
            contract_address: "string.alphanumeric",
            decimal_place: "number",
        },
        "[]",
    ],
    description: "string|null",
    image_url: "string.url|null",
});
export const savedCoinType = coinType.merge({ id: "number.integer" });
const candleType = type({
    coin_id: "number.integer",
    frequency: "'daily'|'hourly'",
    timestamp: "Date",
    open: "number.integer",
    high: "number.integer",
    low: "number.integer",
    close: "number.integer",
});
export const nftType = type({
    name: "string",
    symbol: "string",
    provider: type.enumerated(...providers),
    contract_address: "string",
    blockchain: ["===", ...EveryBlockainsName],
    image_url: "string",
    description: "string|null",
    token_id: "number",
    price: "number",
});
export const savedNftType = nftType.merge({ id: "number.integer" });
