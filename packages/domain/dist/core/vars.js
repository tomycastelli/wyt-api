export const blockchains = {
    bitcoin: {
        ecosystem: "bitcoin",
        coin: "bitcoin",
        decimal_places: 8,
    },
    ethereum: {
        ecosystem: "ethereum",
        coin: "ethereum",
        decimal_places: 18,
    },
    solana: {
        ecosystem: "solana",
        coin: "solana",
        decimal_places: 9,
    },
    "polygon-pos": {
        ecosystem: "ethereum",
        coin: "matic-network",
        decimal_places: 18,
    },
    "binance-smart-chain": {
        ecosystem: "ethereum",
        coin: "binancecoin",
        decimal_places: 18,
    },
    avalanche: {
        ecosystem: "ethereum",
        coin: "avalanche-2",
        decimal_places: 18,
    },
};
export const EveryBlockainsName = Object.keys(blockchains);
export const base_coins = Object.values(blockchains).map((blockchain) => blockchain.coin);
export const providers = ["coingecko"];
