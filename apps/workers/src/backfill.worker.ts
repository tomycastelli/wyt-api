import {
  type CoinsProvider,
  type CoinsRepository,
  type SavedWallet,
  type WalletsRepository,
  type WalletsService,
  type WalletsStreamsProvider,
  blockchains,
} from "@repo/domain";
import { type Queue, QueueEvents, Worker } from "bullmq";
import type { BackfillChunkQueue, WalletJobsQueue } from "./index.js";

export const setupBackfillWorker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  chunks_queue: Queue<BackfillChunkQueue>,
  redis_url: string,
): Worker<{
  wallet: SavedWallet;
}> => {
  const backfillWorker = new Worker<{
    wallet: SavedWallet;
  }>(
    "backfillQueue",
    async (job) => {
      console.log(
        `Starting backfill ${job.name} with ID ${job.id} and wallet: ${job.data.wallet.address}`,
      );

      const ecosystem = blockchains[job.data.wallet.blockchain].ecosystem;

      if (ecosystem === "ethereum") {
        // Consigo los chunks
        const chunks = await wallets_service.getHistoryTimeChunks(
          job.data.wallet,
          30,
        );

        const name = "backfill_chunk";
        await chunks_queue.addBulk(
          chunks.map((c) => ({
            name,
            data: {
              from_date: c.from_date.toISOString(),
              to_date: c.to_date.toISOString(),
              wallet: job.data.wallet,
              total_chunks: 30,
            },
          })),
        );
      } else {
        await chunks_queue.add("backfill_unique_chunk", {
          wallet: job.data.wallet,
          from_date: new Date().toISOString(),
          to_date: new Date().toISOString(),
          total_chunks: 1,
        });
      }
    },
    {
      connection: {
        host: redis_url,
        port: 6379,
      },
      concurrency: 200,
      limiter: {
        max: 200,
        duration: 1000,
      },
    },
  );

  backfillWorker.on("ready", async () => {
    console.log("backfillWorker is ready!");
    const pending_wallets = await wallets_service.getPendingWallets();
    console.log(
      `Found ${pending_wallets.length} pending wallets. Backfill starting...`,
    );
    for (const wallet of pending_wallets) {
      const ecosystem = blockchains[wallet.blockchain].ecosystem;

      if (ecosystem === "ethereum") {
        // Consigo los chunks
        const chunks = await wallets_service.getHistoryTimeChunks(wallet, 10);

        const name = "backfill_chunk";
        await chunks_queue.addBulk(
          chunks.map((c) => ({
            name,
            data: {
              from_date: c.from_date.toISOString(),
              to_date: c.to_date.toISOString(),
              wallet: wallet,
              total_chunks: 10,
            },
          })),
        );
      } else {
        await chunks_queue.add("backfill_unique_chunk", {
          wallet: wallet,
          from_date: new Date().toISOString(),
          to_date: new Date().toISOString(),
          total_chunks: 1,
        });
      }
    }
  });

  backfillWorker.on("completed", (job) => {
    console.log(
      `Chunks for job: ${job.id}, for wallet ${job.data.wallet.address} have been sent`,
    );
  });

  backfillWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} has failed with err: `, err);
  });

  return backfillWorker;
};

export const setupBackfillChunkWorker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  wallets_jobs_queue: Queue<WalletJobsQueue>,
  chunks_queue: Queue<BackfillChunkQueue>,
  redis_url: string,
): Worker<BackfillChunkQueue> => {
  const backfillChunkWorker = new Worker<BackfillChunkQueue>(
    "backfillChunkQueue",
    async (job) => {
      console.log(
        `Starting chunk job ${job.name} with ID ${job.id} for wallet: ${job.data.wallet.address}.`,
        `From ${job.data.from_date} to ${job.data.to_date}`,
      );
      let loop_cursor: string | undefined = undefined;
      let transaction_count = 0;

      do {
        const { transactions, cursor } =
          await wallets_service.getTransactionHistory(
            job.data.wallet,
            new Date(job.data.from_date),
            new Date(job.data.to_date),
            loop_cursor,
          );

        loop_cursor = cursor;

        if (transactions.length > 0) {
          // Guardo las [Transaction]s
          await wallets_jobs_queue.add(
            `backfill_transactions-wallet:${job.data.wallet.address}`,
            {
              jobName: "saveTransactions",
              data: {
                blockchain: job.data.wallet.blockchain,
                transactions,
              },
            },
          );

          transaction_count += transactions.length;

          await job.updateProgress({ transaction_count: transaction_count });
        }
      } while (loop_cursor);
    },
    {
      connection: {
        host: redis_url,
        port: 6379,
      },
      concurrency: 200,
      limiter: {
        max: 200,
        duration: 1000,
      },
      lockDuration: 600_000,
    },
  );

  backfillChunkWorker.on("ready", () => {
    console.log("backfillChunkWorker is ready!");
  });

  backfillChunkWorker.on("completed", async (job) => {
    const { wallet } = job.data;

    const jobs = await chunks_queue.getJobs(["completed"]);
    const chunk_jobs = jobs.filter((j) => j.data.wallet.id === wallet.id);

    if (chunk_jobs.length === job.data.total_chunks) {
      // Ya termino el último chunk
      // Ahora quiero esperar a que los wallet_jobs que guardan las transacciones hayan terminado
      const queueEvents = new QueueEvents("walletJobsQueue", {
        connection: {
          host: redis_url,
          port: 6379,
        },
      });
      await queueEvents.waitUntilReady();

      const wallet_jobs = await wallets_jobs_queue.getJobs(["active"]);
      const wallet_jobs_promises = wallet_jobs.map((job) =>
        job.waitUntilFinished(queueEvents),
      );

      await Promise.all(wallet_jobs_promises);

      // Termino el proceso
      await wallets_service.finishBackfill(wallet);
      console.log("Backfill process completed for wallet: ", wallet.id);
    }
  });

  backfillChunkWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} has failed with err: `, err);
  });

  return backfillChunkWorker;
};
