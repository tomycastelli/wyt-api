export const blockchains = {
  bitcoin: {
    coin: "bitcoin",
    decimal_places: 8,
  },
  ethereum: {
    coin: "ethereum",
    decimal_places: 18,
  },
  solana: {
    coin: "solana",
    decimal_places: 9,
  },
  "polygon-pos": {
    coin: "matic-network",
    decimal_places: 18,
  },
  "binance-smart-chain": {
    coin: "binancecoin",
    decimal_places: 18,
  },
  avalanche: {
    coin: "avalanche-2",
    decimal_places: 18,
  },
} as const;

export type BlockchainsName = keyof typeof blockchains;
export const EveryBlockainsName = Object.keys(blockchains) as BlockchainsName[];

export const base_coins = Object.values(blockchains).map(
  (blockchain) => blockchain.coin,
);

export const providers = ["coin_gecko"];
