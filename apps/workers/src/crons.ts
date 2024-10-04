import { SavedCoin } from "@repo/domain";
import type { Queue } from "bullmq";
import { schedule } from "node-cron";
import type { CoinJobsQueue, WalletJobsQueue } from "./index.js";

export const wallet_crons = (
	wallet_jobs_queue: Queue<WalletJobsQueue>,
): void => {
	schedule("0 * * * *", () => {
		// Cada 1 hora
		wallet_jobs_queue.add("updating solana wallets", {
			jobName: "updateBlockchainWallets",
			data: {
				blockchain: "solana",
			},
		});
	});
};

export const coin_crons = (coin_jobs_queue: Queue<CoinJobsQueue>): void => {
	// Actualización de [Coin]s
	schedule("0 * * * *", () => {
		// Cada 1 hora
		coin_jobs_queue.add("updating solana wallets", {
			jobName: "updateCoins",
			updateCoinsData: { frequency: "hourly", refresh_rate: 1 },
		});
	});

	schedule("0 */4 * * *", () => {
		// Cada 4 horas
		coin_jobs_queue.add("updating solana wallets", {
			jobName: "updateCoins",
			updateCoinsData: { frequency: "hourly", refresh_rate: 4 },
		});
	});

	schedule("0 */12 * * *", () => {
		// Cada 12 horas
		coin_jobs_queue.add("updating solana wallets", {
			jobName: "updateCoins",
			updateCoinsData: { frequency: "hourly", refresh_rate: 12 },
		});
	});

	schedule("35 0 * * *", () => {
		// Cada 1 dia a las 00:35
		coin_jobs_queue.add("updating solana wallets", {
			jobName: "updateCoins",
			updateCoinsData: { frequency: "daily", refresh_rate: 1 },
		});
	});

	schedule("35 0 */2 * *", () => {
		// Cada 2 días a las 00:35
		coin_jobs_queue.add("updating solana wallets", {
			jobName: "updateCoins",
			updateCoinsData: { frequency: "daily", refresh_rate: 2 },
		});
	});

	schedule("35 0 */4 * *", () => {
		// Cada 4 días a las 00:35
		coin_jobs_queue.add("updating solana wallets", {
			jobName: "updateCoins",
			updateCoinsData: { frequency: "daily", refresh_rate: 4 },
		});
	});
};
