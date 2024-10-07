import type {
  CoinsProvider,
  CoinsRepository,
  SavedWallet,
  WalletsRepository,
  WalletsService,
  WalletsStreamsProvider,
} from "@repo/domain";
import { type Queue, Worker } from "bullmq";
import type { CoinJobsQueue, WalletJobsQueue } from "./index.js";

export const setup_backfill_worker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  coin_jobs_queue: Queue<CoinJobsQueue>,
  wallets_jobs_queue: Queue<WalletJobsQueue>,
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
        `Starting job ${job.name} with ID ${job.id} and wallet: ${job.data.wallet.address}`,
      );

      let loop_cursor: string | undefined = undefined;
      let first_transfer_date: Date | null = null;
      let transaction_count = 0;

      do {
        const { transactions, cursor } =
          await wallets_service.getTransactionHistory(
            job.data.wallet,
            job.data.stream_webhook_url,
          );

        // Guardo las [Transaction]s
        await wallets_jobs_queue.add("backfill_transactions", {
          jobName: "saveTransactions",
          data: {
            blockchain: job.data.wallet.blockchain,
            transactions,
          },
        });

        loop_cursor = cursor;

        if (transactions.length > 0) {
          transaction_count += transactions.length;
          await job.updateProgress({ transaction_count: transaction_count });

          first_transfer_date =
            transactions[transactions.length - 1]!.block_timestamp;
        }
      } while (loop_cursor);

      // Termino el proceso
      await wallets_service.finishBackfill(
        job.data.wallet,
        first_transfer_date,
        job.data.stream_webhook_url,
      );
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
