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
  type SavedWallet,
  type Transaction,
  WalletsService,
} from "@repo/domain";
import {
  setupBackfillChunkWorker,
  setupBackfillWorker,
} from "./backfill.worker.js";
import { setupCoinsWorker } from "./coins.worker.js";
import { coin_crons, wallet_crons } from "./crons.js";
import { setupTransactionsWorker } from "./transactions.worker.js";
import { setupWalletsWorker } from "./wallets.worker.js";

// Deserialización de BigInts
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

BigInt.prototype.toJSON = function () {
  return Number(this);
};

export type CoinJobsQueue = {
  jobName: "saveAllCoins" | "saveLatestCoins" | "updateCoins";
  updateCoinsData?: {
    frequency: "daily" | "hourly";
    refresh_rate: number;
  };
};

export type WalletJobsQueue = {
  jobName: "updateBlockchainWallets" | "saveTransactions";
  data: {
    blockchain: BlockchainsName;
    transactions?: Transaction[];
  };
};

export type BackfillChunkQueue = {
  wallet: SavedWallet;
  from_date: string;
  to_date: string;
  total_chunks: number;
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

// Queues

new Queue<{
  wallet: SavedWallet;
}>("backfillQueue", {
  connection: {
    host: REDIS_URL,
    port: 6379,
  },
});

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

const chunks_queue = new Queue<BackfillChunkQueue>("backfillChunkQueue", {
  connection: {
    host: REDIS_URL,
    port: 6379,
  },
});

setupBackfillWorker(wallets_service, chunks_queue, REDIS_URL);

setupBackfillChunkWorker(
  wallets_service,
  wallet_jobs_queue,
  chunks_queue,
  REDIS_URL,
);

setupWalletsWorker(wallets_service, REDIS_URL);

setupCoinsWorker(coins_service, REDIS_URL);

setupTransactionsWorker(wallets_service, REDIS_URL);

// Set up de crons
wallet_crons(wallet_jobs_queue);
coin_crons(coin_jobs_queue);
