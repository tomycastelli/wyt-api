import type {
  CoinsProvider,
  CoinsRepository,
  CoinsService,
} from "@repo/domain";
import { Worker } from "bullmq";
import type { CoinJobsQueue } from "./index.js";

export const setupCoinsWorker = (
  coins_service: CoinsService<CoinsProvider, CoinsRepository>,
  redis_url: string,
): Worker<CoinJobsQueue> => {
  const coinJobsWorker = new Worker<CoinJobsQueue>(
    "coinJobsQueue",
    async (job) => {
      console.log(
        `Starting job ${job.name} with ID ${job.id} and data: ${JSON.stringify(job.data)}`,
      );
      const payload = job.data;
      switch (payload.jobName) {
        case "saveAllCoins":
          await coins_service.saveAllCoins();
          break;
        case "saveLatestCoins": {
          await coins_service.saveLatestCoins();
          break;
        }
        case "updateCoins": {
          await coins_service.updateCoinsByMarketcap(
            payload.updateCoinsData!.importance_level,
          );
          break;
        }
      }
    },
    {
      connection: {
        host: redis_url,
        port: 6379,
      },
      concurrency: 200,
      limiter: {
        max: 200,
        duration: 1000,
      },
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

  return coinJobsWorker;
};
