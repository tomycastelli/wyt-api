import {
  BlockchainsName,
  CoinsProvider,
  CoinsRepository,
  CoinsService,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { Worker } from "bullmq";

export const setup_transactions_worker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  coins_service: CoinsService<CoinsProvider, CoinsRepository>,
  redis_url: string,
) => {
  const transactionsStreamWorker = new Worker<{
    body: any;
    blockchain: BlockchainsName;
  }>(
    "transactionsStreamQueue",
    async (job) => {
      console.log(
        `Starting job ${job.name} with ID ${job.id} and data: ${job.data}`,
      );
      const response = await wallets_service.handleWebhookTransaction(
        job.data.body,
        job.data.blockchain,
      );
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

  transactionsStreamWorker.on("ready", () => {
    console.log("transactionsStreamWorker is ready!");
  });

  transactionsStreamWorker.on("completed", (job) => {
    console.log(
      `Job: ${job.id}, for stream of blockchain ${job.data.blockchain} has completed!`,
    );
  });

  transactionsStreamWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} has failed with err: `, err);
  });

  return transactionsStreamWorker;
};
