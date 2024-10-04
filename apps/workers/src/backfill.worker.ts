import {
  CoinsProvider,
  CoinsRepository,
  SavedWallet,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { Queue, Worker } from "bullmq";
import { CoinJobsQueue } from "./index.js";

export const setup_backfill_worker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  coin_jobs_queue: Queue<CoinJobsQueue>,
  redis_url: string,
): Worker<{
  wallet: SavedWallet;
  stream_webhook_url: string;
}> => {
  const backfillWorker = new Worker<{
    wallet: SavedWallet;
    stream_webhook_url: string;
  }>(
    "backfillQueue",
    async (job) => {
      console.log(
        `Starting job ${job.name} with ID ${job.id} and data: ${job.data}`,
      );
      const response = await wallets_service.backfillWallet(
        job.data.wallet,
        job.data.stream_webhook_url,
      );
      await job.updateProgress({ new_coins: response.new_coins });
      if (response) {
        coin_jobs_queue.add("backfill_wallet_coins", {
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

  return backfillWorker;
};
