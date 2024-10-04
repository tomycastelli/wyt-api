import { Queue, Worker } from "bullmq";
import "dotenv/config";
import {
  CoinGecko,
  CoinsPostgres,
  WalletsPostgres,
  WalletsProviderAdapters,
} from "@repo/adapters";
import {
  type BlockchainsName,
  CoinsService,
  type SavedCoin,
  WalletsService,
} from "@repo/domain";
import { coin_crons, wallet_crons } from "./crons.js";
import { setup_coins_worker } from "./coins.worker.js";
import { setup_backfill_worker } from "./backfill.worker.js";
import { setup_wallets_worker } from "./wallets.worker.js";
import { setup_transactions_worker } from "./transactions.worker.js";

export type CoinJobsQueue = {
  jobName: "saveAllCoins" | "saveLatestCoins" | "updateCoins" | "newCoins";
  updateCoinsData?: {
    frequency: "daily" | "hourly";
    refresh_rate: number;
  };
  newCoinsData?: SavedCoin[];
};

export type WalletJobsQueue = {
  jobName: "updateBlockchainWallets";
  data: {
    blockchain: BlockchainsName;
  };
};

export const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw Error("REDIS_URL missing");

// Los adapters
const coingecko = new CoinGecko(process.env.COINGECKO_API_KEY ?? "");
const coins_postgres = new CoinsPostgres(process.env.POSTGRES_URL ?? "");

// El servicio de Coins
const coins_service = new CoinsService(coins_postgres, coingecko);

const wallets_repository = new WalletsPostgres(process.env.POSTGRES_URL ?? "");
const wallets_provider = new WalletsProviderAdapters(
  process.env.MORALIS_API_KEY ?? "",
  [
    { url: process.env.QUICKNODE_SOLANA_RPC ?? "", weight: 30 },
    { url: process.env.ALCHEMY_SOLANA_RPC ?? "", weight: 70 },
  ],
);

await wallets_provider.initialize();

// El servicio de Wallets
const wallets_service = new WalletsService(
  wallets_repository,
  wallets_provider,
  coins_service,
);

setup_backfill_worker(wallets_service, coins_service, REDIS_URL);

setup_wallets_worker(wallets_service, REDIS_URL);

setup_coins_worker(coins_service, REDIS_URL);

setup_transactions_worker(wallets_service, coins_service, REDIS_URL);

const coin_jobs_queue = new Queue<CoinJobsQueue>("coinJobsQueue", {
  connection: {
    host: REDIS_URL,
    port: 6379,
  },
});

const wallet_jobs_queue = new Queue<WalletJobsQueue>("walletJobsQueue", {
  connection: {
    host: REDIS_URL,
    port: 6379,
  },
});

// Set up de crons
wallet_crons(wallet_jobs_queue);
coin_crons(coin_jobs_queue);
