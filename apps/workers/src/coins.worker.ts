import type {
	CoinsProvider,
	CoinsRepository,
	CoinsService,
} from "@repo/domain";
import { Worker } from "bullmq";
import type { CoinJobsQueue } from "./index.js";

export const setup_coins_worker = (
	coins_service: CoinsService<CoinsProvider, CoinsRepository>,
	redis_url: string,
): Worker<CoinJobsQueue> => {
	const coinJobsWorker = new Worker<CoinJobsQueue>(
		"coinJobsQueue",
		async (job) => {
			console.log(
				`Starting job ${job.name} with ID ${job.id} and data: ${job.data}`,
			);
			const payload = job.data;
			switch (payload.jobName) {
				case "saveAllCoins":
					await coins_service.saveAllCoins();
					break;
				case "saveLatestCoins": {
					const new_coins = await coins_service.saveLatestCoins();
					for (const new_coin of new_coins) {
						await coins_service.getCoinHistorialCandles("daily", new_coin);
						await coins_service.getCoinHistorialCandles("hourly", new_coin);
					}
					break;
				}
				case "updateCoins": {
					await coins_service.updateCoinsByMarketcap(
						payload.updateCoinsData!.frequency,
						payload.updateCoinsData!.refresh_rate,
					);
					break;
				}
				case "newCoins": {
					for (const new_coin of payload.newCoinsData!) {
						await coins_service.getCoinHistorialCandles("daily", new_coin);
						await coins_service.getCoinHistorialCandles("hourly", new_coin);
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

	coinJobsWorker.on("ready", () => {
		console.log("coinJobsWorker is ready!");
	});

	coinJobsWorker.on("completed", (job) => {
		console.log(`Job: ${job.id}, for ${job.data.jobName} has completed!`);
	});

	coinJobsWorker.on("failed", (job, err) => {
		console.error(
			`Job ${job?.data.jobName}-${job?.id} has failed with err: `,
			err,
		);
	});

	return coinJobsWorker;
};
