import { Queue, QueueEvents, type QueueOptions } from "bullmq";
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
  type SavedWallet,
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

export const JOB_CONCURRENCY = 50;

export type CoinJobsQueue = {
  jobName: "saveAllCoins" | "saveLatestCoins" | "updateCoins";
  updateCoinsData?: {
    importance_level: 1 | 2 | 3;
  };
};

export type WalletJobsQueue = {
  jobName: "updateWallets";
  data: {
    hourly_frequency: 0.25 | 0.5 | 1 | 2 | 4 | 24;
  };
};

export type BackfillChunkQueue = {
  address: string;
  blockchain: BlockchainsName;
  from_block: number;
  to_block: number;
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
const queue_options: QueueOptions = {
  connection: {
    host: REDIS_URL,
    port: 6379,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
  },
};

new Queue<{
  wallet: SavedWallet;
}>("backfillQueue", queue_options);

const coin_jobs_queue = new Queue<CoinJobsQueue>(
  "coinJobsQueue",
  queue_options,
);

const wallet_jobs_queue = new Queue<WalletJobsQueue>(
  "walletJobsQueue",
  queue_options,
);

export const CHUNK_AMOUNT = 10;

const chunks_queue = new Queue<BackfillChunkQueue>("backfillChunkQueue", {
  defaultJobOptions: {
    removeOnComplete: Math.ceil(CHUNK_AMOUNT * 1.2),
    ...queue_options.defaultJobOptions,
  },
  ...queue_options,
});

const chunk_queue_events = new QueueEvents("backfillChunkQueue", {
  connection: {
    host: REDIS_URL,
    port: 6379,
  },
});

setupBackfillWorker(
  wallets_service,
  chunks_queue,
  chunk_queue_events,
  REDIS_URL,
);

setupBackfillChunkWorker(wallets_service, chunks_queue, REDIS_URL);

setupWalletsWorker(wallets_service, REDIS_URL);

setupCoinsWorker(coins_service, REDIS_URL);

setupTransactionsWorker(wallets_service, REDIS_URL);

// Set up de crons
wallet_crons(wallet_jobs_queue);
coin_crons(coin_jobs_queue);
