import {
  BlockchainsName,
  CoinsProvider,
  CoinsRepository,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { Queue, Worker } from "bullmq";
import { CoinJobsQueue } from "./index.js";

export const setup_transactions_worker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  coin_jobs_queue: Queue<CoinJobsQueue>,
  redis_url: string,
) => {
  const transactionsStreamWorker = new Worker<{
    body: any;
    blockchain: BlockchainsName;
  }>(
    "transactionsStreamQueue",
    async (job) => {
      console.log(
        `Starting job ${job.name} with ID ${job.id} and data: ${job.data}`,
      );
      const response = await wallets_service.handleWebhookTransaction(
        job.data.body,
        job.data.blockchain,
      );
      if (response) {
        await coin_jobs_queue.add("new_transaction_coins", {
          jobName: "newCoins",
          newCoinsData: response.new_coins,
        });
      }
    },
    {
      connection: {
        host: redis_url,
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

  return transactionsStreamWorker;
};
