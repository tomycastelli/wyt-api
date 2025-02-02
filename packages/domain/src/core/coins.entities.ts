import { type } from "arktype";
import { EveryBlockainsName, providers } from "./vars.js";

/// Las entidades que conforman a la aplicacion

const coinMarketDataType = type({
  market_cap: "number",
  price: "number",
  price_change_percentage_24h: "number",
  price_change_24h: "number",
  total_volume: "number|null",
  ath: "number",
  name: "string",
  display_name: "string",
});

export const coinType = coinMarketDataType.merge({
  name: "string",
  display_name: "string|null",
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

export const savedCoinType = coinType.merge({
  id: "number.integer",
  last_update: "Date",
});

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
  contract_address: "string",
  blockchain: ["===", ...EveryBlockainsName],
  token_id: "number",
});

export const savedNftType = nftType.merge({ id: "number.integer" });

/** # Representacion de una criptomoneda. Cada [Coin] esta asociada a una fuente de información */
export type Coin = typeof coinType.infer;

/** # Datos de mercado de una criptomoneda */
export type CoinMarketData = typeof coinMarketDataType.infer;

/** # Una criptomoneda guardada previamente en una base de datos */
export type SavedCoin = typeof savedCoinType.infer;

/** # Un NFT en una red blockchain */
export type NFT = typeof nftType.infer;

/** # Una NFT guardada previamente en una base de datos */
export type SavedNFT = typeof savedNftType.infer;

/** # Vela OHCL en un punto de tiempo para un par coin-fiat */
export type Candle = typeof candleType.infer;
