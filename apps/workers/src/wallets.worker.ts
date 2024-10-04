import { CoinJobsQueue, WalletJobsQueue } from "./index.js";
import { Queue, Worker } from "bullmq";
import {
  CoinsProvider,
  CoinsRepository,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";

export const setup_wallets_worker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  coin_jobs_queue: Queue<CoinJobsQueue>,
  redis_url: string,
): Worker<WalletJobsQueue> => {
  const walletJobsWorker = new Worker<WalletJobsQueue>(
    "walletJobsQueue",
    async (job) => {
      console.log(
        `Starting job ${job.name} with ID ${job.id} and data: ${job.data}`,
      );
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

            await job.updateProgress({ page });

            // Las actualizo
            for (const wallet of wallets) {
              const response = await wallets_service.updateWallet(wallet);
              if (response) {
                coin_jobs_queue.add("update_wallet_coins", {
                  jobName: "newCoins",
                  newCoinsData: response.new_coins,
                });
              }
            }

            if (wallets.length < 20) is_last_page = true;
          }

          break;
        }
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
