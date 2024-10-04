import { Worker } from "bullmq";
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
  WalletsService,
} from "@repo/domain";

export type JobsQueue = {
  jobName: "saveAllCoins" | "saveLatestCoins" | "candles" | "historicalCandles";
  data?: {
    coin: SavedCoin;
    frequency: "daily" | "hourly";
    refresh_rate?: number;
  };
};

const REDIS_URL = process.env.REDIS_URL;
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

const backfillWorker = new Worker<{
  wallet: SavedWallet;
  stream_webhook_url: string;
}>(
  "backfillQueue",
  async (job) => {
    console.log(`backfillWorker started for wallet: ${job.data.wallet.id}`);
    const response = await wallets_service.backfillWallet(
      job.data.wallet,
      job.data.stream_webhook_url,
    );
    if (response) {
      for (const new_coin of response.new_coins) {
        await coins_service.getCoinHistorialCandles("daily", new_coin);
        await coins_service.getCoinHistorialCandles("hourly", new_coin);
      }
    }
  },
  {
    connection: {
      host: REDIS_URL,
      port: 6379,
    },
    concurrency: 10,
  },
);

backfillWorker.on("ready", () => {
  console.log("backfillWorker is ready!");
});

backfillWorker.on("completed", (job) => {
  console.log(
    `Job: ${job.id}, for wallet ${job.data.wallet.address} has completed!`,
  );
});

backfillWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} has failed with err: `, err);
});

const transactionsStreamWorker = new Worker<{
  body: any;
  blockchain: BlockchainsName;
}>(
  "transactionsStreamQueue",
  async (job) => {
    const response = await wallets_service.handleWebhookTransaction(
      job.data.body,
      job.data.blockchain,
    );
    if (response) {
      for (const new_coin of response.new_coins) {
        await coins_service.getCoinHistorialCandles("daily", new_coin);
        await coins_service.getCoinHistorialCandles("hourly", new_coin);
      }
    }
  },
  {
    connection: {
      host: REDIS_URL,
      port: 6379,
    },
    concurrency: 10,
  },
);

transactionsStreamWorker.on("ready", () => {
  console.log("transactionsStreamWorker is ready!");
});

transactionsStreamWorker.on("completed", (job) => {
  console.log(
    `Job: ${job.id}, for stream of blockchain ${job.data.blockchain} has completed!`,
  );
});

transactionsStreamWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} has failed with err: `, err);
});

const coinJobsWorker = new Worker<JobsQueue>(
  "coinJobsQueue",
  async (job) => {
    const payload = job.data;
    switch (payload.jobName) {
      case "saveAllCoins":
        await coins_service.saveAllCoins();
        break;
      case "saveLatestCoins": {
        const new_coins = await coins_service.saveLatestCoins();
        for (const new_coin of new_coins) {
          await coins_service.getCoinHistorialCandles("daily", new_coin);
          await coins_service.getCoinHistorialCandles("hourly", new_coin);
        }
        break;
      }
      case "candles": {
        await coins_service.saveCandles(
          payload.data!.coin.id,
          payload.data!.frequency,
          payload.data!.refresh_rate!,
        );
        break;
      }
      case "historicalCandles":
        await coins_service.getCoinHistorialCandles(
          payload.data!.frequency,
          payload.data!.coin,
        );
        break;
    }
  },
  {
    connection: {
      host: REDIS_URL,
      port: 6379,
    },
    concurrency: 10,
  },
);

coinJobsWorker.on("ready", () => {
  console.log("coinJobsWorker is ready!");
});

coinJobsWorker.on("completed", (job) => {
  console.log(`Job: ${job.id}, for ${job.data.jobName} has completed!`);
});

coinJobsWorker.on("failed", (job, err) => {
  console.error(
    `Job ${job?.data.jobName}-${job?.id} has failed with err: `,
    err,
  );
});
