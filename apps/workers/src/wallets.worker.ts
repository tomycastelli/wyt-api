import type {
  CoinsProvider,
  CoinsRepository,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { Worker } from "bullmq";
import { JOB_CONCURRENCY, type WalletJobsQueue } from "./index.js";

export const setupWalletsWorker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  redis_url: string,
): Worker<WalletJobsQueue> => {
  const walletJobsWorker = new Worker<WalletJobsQueue>(
    "walletJobsQueue",
    async (job) => {
      console.log(`Starting job ${job.name} with ID ${job.id}`);
      const payload = job.data;
      switch (payload.jobName) {
        case "updateWallets": {
          const wallets = await wallets_service.getWalletsToUpdate(
            payload.data.hourly_frequency,
          );

          // Las actualizo
          let counter = 0;
          for (const wallet of wallets) {
            await wallets_service.updateWallet(wallet);
            counter++;
            await job.updateProgress({
              wallet: wallet.address,
              out_of_total: counter / wallets.length,
            });
          }
        }
      }
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

  walletJobsWorker.on("ready", () => {
    console.log("walletJobsWorker is ready!");
  });

  walletJobsWorker.on("completed", (job) => {
    console.log(`Job: ${job.id}, for ${job.data.jobName} has completed!`);
  });

  walletJobsWorker.on("failed", (job, err) => {
    console.error(
      `Job ${job?.data.jobName}-${job?.id} has failed with err: `,
      err,
    );
  });

  walletJobsWorker.on("progress", (_, progress) => {
    console.log("Wallet updated: ", progress);
  });

  return walletJobsWorker;
};
