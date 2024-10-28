import type { Queue } from "bullmq";
import { schedule } from "node-cron";
import type { CoinJobsQueue, WalletJobsQueue } from "./index.js";

export const wallet_crons = (
  wallet_jobs_queue: Queue<WalletJobsQueue>,
): void => {
  schedule("*/15 * * * *", () => {
    wallet_jobs_queue.add("updating 15 minutes wallets", {
      jobName: "updateWallets",
      data: {
        hourly_frequency: 0.25,
      },
    });
  });

  schedule("*/30 * * * *", () => {
    wallet_jobs_queue.add("updating 30 minutes wallets", {
      jobName: "updateWallets",
      data: {
        hourly_frequency: 0.5,
      },
    });
  });

  schedule("5 * * * *", () => {
    wallet_jobs_queue.add("updating 1 hour wallets", {
      jobName: "updateWallets",
      data: {
        hourly_frequency: 1,
      },
    });
  });

  schedule("5 */2 * * *", () => {
    wallet_jobs_queue.add("updating 2 hour wallets", {
      jobName: "updateWallets",
      data: {
        hourly_frequency: 2,
      },
    });
  });

  schedule("10 */4 * * *", () => {
    wallet_jobs_queue.add("updating 4 hour wallets", {
      jobName: "updateWallets",
      data: {
        hourly_frequency: 4,
      },
    });
  });

  schedule("10 3 * * *", () => {
    wallet_jobs_queue.add("updating 24 hour wallets", {
      jobName: "updateWallets",
      data: {
        hourly_frequency: 24,
      },
    });
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
