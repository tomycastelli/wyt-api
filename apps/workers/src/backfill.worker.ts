import {
  CoinsProvider,
  CoinsRepository,
  CoinsService,
  SavedWallet,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { Worker } from "bullmq";

export const setup_backfill_worker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  coins_service: CoinsService<CoinsProvider, CoinsRepository>,
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
        for (const new_coin of response.new_coins) {
          await coins_service.getCoinHistorialCandles("daily", new_coin);
          await coins_service.getCoinHistorialCandles("hourly", new_coin);
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
