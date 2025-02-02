import type {
  BlockchainsName,
  CoinsProvider,
  CoinsRepository,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { Worker } from "bullmq";
import { JOB_CONCURRENCY } from "./index.js";

export const setupTransactionsWorker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  redis_url: string,
) => {
  const transactionsStreamWorker = new Worker<{
    body: any;
    blockchain: BlockchainsName;
  }>(
    "transactionsStreamQueue",
    async (job) => {
      console.log(
        `Starting job ${job.name} with ID ${job.id} and data: ${JSON.stringify(job.data)}`,
      );
      await wallets_service.handleWebhookTransaction(
        job.data.body,
        job.data.blockchain,
      );
    },
    {
      connection: {
        host: redis_url,
        port: 6379,
      },
      concurrency: JOB_CONCURRENCY,
      limiter: {
        max: JOB_CONCURRENCY,
        duration: 1000,
      },
    },
  );

  transactionsStreamWorker.on("ready", async () => {
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

  return transactionsStreamWorker;
};
