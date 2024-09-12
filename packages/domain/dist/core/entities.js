import { type } from "arktype";
import { providers } from "./vars";
/// Las entidades que conforman a la aplicacion
const coinMarketDataType = type({
    market_cap: "number",
    price: "number",
    price_change_24h: "number",
    ath: "number",
    name: "string",
});
const coinType = coinMarketDataType.merge({
    name: "string",
    symbol: "string",
    provider: type.enumerated(...providers),
    contracts: [
        {
            blockchain: "string",
            address: "string.alphanumeric",
        },
        "[]",
    ],
    description: "string|null",
    image_url: "string.url|null",
});
const savedCoinType = coinType.merge({ id: "number.integer" });
const candleType = type({
    coin_id: "number.integer",
    frequency: "'daily'|'hourly'",
    timestamp: "Date",
    open: "number.integer",
    high: "number.integer",
    low: "number.integer",
    close: "number.integer",
});
