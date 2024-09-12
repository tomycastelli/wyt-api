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
  interval: "'daily'|'hourly'",
  timestamp: "Date",
  open: "number.integer",
  high: "number.integer",
  low: "number.integer",
  close: "number.integer",
});

/** # Representacion de una criptomoneda. Cada [Coin] esta asociada a una fuente de información */
export type Coin = typeof coinType.infer;

export type CoinMarketData = typeof coinMarketDataType.infer;

/** # Una criptomoneda guardada previamente en alguna base de datos */
export type SavedCoin = typeof savedCoinType.infer;

/** # Vela OHCL en un punto de tiempo para un par coin-fiat */
export type Candle = typeof candleType.infer;
