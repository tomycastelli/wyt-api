import { type } from "arktype";
import { blockchains, EveryBlockainsName, providers } from "./vars";

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
