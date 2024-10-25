export const blockchains = {
  bitcoin: {
    ecosystem: "bitcoin",
    coin: "bitcoin",
    decimal_places: 8,
    scanner: "https://www.blockchain.com/en/explorer",
  },
  ethereum: {
    ecosystem: "ethereum",
    coin: "ethereum",
    decimal_places: 18,
    scanner: "https://etherscan.io",
  },
  solana: {
    ecosystem: "solana",
    coin: "solana",
    decimal_places: 9,
    scanner: "https://solscan.io",
  },
  "polygon-pos": {
    ecosystem: "ethereum",
    coin: "matic-network",
    decimal_places: 18,
    scanner: "https://polygonscan.com",
  },
  "binance-smart-chain": {
    ecosystem: "ethereum",
    coin: "binancecoin",
    decimal_places: 18,
    scanner: "https://bscscan.com",
  },
  avalanche: {
    ecosystem: "ethereum",
    coin: "avalanche-2",
    decimal_places: 18,
    scanner: "https://snowtrace.io",
  },
} as const;

export type BlockchainsName = keyof typeof blockchains;
export const EveryBlockainsName = Object.keys(blockchains) as BlockchainsName[];

export const base_coins = Object.values(blockchains).map(
  (blockchain) => blockchain.coin,
);

export type BlockchainCoin =
  (typeof blockchains)[keyof typeof blockchains]["coin"];

export const providers = ["coingecko"];

export const generateFilledDateRange = (
  from_date: Date,
  to_date: Date,
  frequency: "hourly" | "daily",
): number[] => {
  if (to_date > new Date())
    throw Error(`To date is bigger than now!. to_date: ${to_date}`);

  const timestamps: number[] = [];
  const current_date = new Date(from_date);

  if (frequency === "daily") {
    while (current_date <= to_date) {
      timestamps.push(new Date(current_date).getTime());
      current_date.setDate(current_date.getDate() + 1);
    }
  } else if (frequency === "hourly") {
    while (current_date <= to_date) {
      timestamps.push(new Date(current_date).getTime());
      current_date.setHours(current_date.getHours() + 1);
    }
  }

  return timestamps;
};

// Helper function to chunk the array
export function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
