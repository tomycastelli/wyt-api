import type {
  CoinsProvider,
  CoinsRepository,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { type Queue, Worker } from "bullmq";
import type { CoinJobsQueue, WalletJobsQueue } from "./index.js";

export const setupWalletsWorker = (
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
        `Starting job ${job.name} with ID ${job.id} and ${job.data.data.transactions?.length} transactions`,
      );
      const payload = job.data;
      switch (payload.jobName) {
        case "updateBlockchainWallets": {
          const page = 1;
          let is_last_page = false;

          while (!is_last_page) {
            const wallets = await wallets_service.getWalletsByBlockchain(
              payload.data.blockchain,
              page,
            );

            // Las actualizo
            for (const wallet of wallets) {
              const response = await wallets_service.updateWallet(wallet);
              if (response) {
                await job.updateProgress({ page, wallet: wallet.address });

                if (response.new_coins.length > 0) {
                  coin_jobs_queue.add("update_wallet_coins", {
                    jobName: "newCoins",
                    newCoinsData: response.new_coins,
                  });
                }
              }
            }

            if (wallets.length < 20) is_last_page = true;
          }

          break;
        }
        case "saveTransactions": {
          const { new_coins } = await wallets_service.saveTransactions(
            payload.data.transactions!.map((t) => ({
              ...t,
              block_timestamp: new Date(t.block_timestamp),
            })),
            payload.data.blockchain,
          );
          if (new_coins.length > 0) {
            coin_jobs_queue.add("save_transaction_coins", {
              jobName: "newCoins",
              newCoinsData: new_coins,
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
