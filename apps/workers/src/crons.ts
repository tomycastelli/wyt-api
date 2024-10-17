import { EveryBlockainsName } from "@repo/domain";
import type { Queue } from "bullmq";
import { schedule } from "node-cron";
import type { CoinJobsQueue, WalletJobsQueue } from "./index.js";

export const wallet_crons = (
  wallet_jobs_queue: Queue<WalletJobsQueue>,
): void => {
  schedule("*/30 * * * *", () => {
    // Cada media hora
    wallet_jobs_queue.addBulk(
      EveryBlockainsName.map((blockchain) => ({
        name: `updating ${blockchain} wallets`,
        data: {
          jobName: "updateBlockchainWallets",
          data: {
            blockchain,
          },
        },
      })),
    );
  });
};

export const coin_crons = (coin_jobs_queue: Queue<CoinJobsQueue>): void => {
  // Actualización de [Coin]s
  schedule("0 * * * *", () => {
    // Cada 1 hora
    coin_jobs_queue.add("updating important coins", {
      jobName: "updateCoins",
      updateCoinsData: { importance_level: 1 },
    });
  });

  schedule("0 */4 * * *", () => {
    // Cada 4 horas
    coin_jobs_queue.add("updating coins", {
      jobName: "updateCoins",
      updateCoinsData: { importance_level: 2 },
    });
  });

  schedule("0 */12 * * *", () => {
    // Cada 12 horas
    coin_jobs_queue.add("updating less importan coins", {
      jobName: "updateCoins",
      updateCoinsData: { importance_level: 3 },
    });
  });

  schedule("0 0 * * *", () => {
    // Cada dia
    coin_jobs_queue.add("fetching latest coins", {
      jobName: "saveLatestCoins",
    });
  });
};
