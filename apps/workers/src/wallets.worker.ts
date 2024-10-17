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
        case "updateBlockchainWallets": {
          let page = 1;
          let is_last_page = false;

          while (!is_last_page) {
            const wallets = await wallets_service.getWalletsByBlockchain(
              payload.data.blockchain,
              page,
            );

            // Las actualizo
            for (const wallet of wallets) {
              await wallets_service.updateWallet(wallet);
              await job.updateProgress({ page, wallet: wallet.address });
            }

            if (wallets.length < 20) is_last_page = true;
            page++;
          }

          break;
        }
        case "saveTransactions": {
          await wallets_service.saveTransactions(
            payload.data.transactions!.map((t) => ({
              ...t,
              block_timestamp: new Date(t.block_timestamp),
            })),
            payload.data.blockchain,
          );
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

  return walletJobsWorker;
};
