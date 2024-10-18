import {
  type CoinsProvider,
  type CoinsRepository,
  type SavedWallet,
  type WalletsRepository,
  type WalletsService,
  type WalletsStreamsProvider,
  blockchains,
} from "@repo/domain";
import { type Queue, Worker } from "bullmq";
import { type BackfillChunkQueue, JOB_CONCURRENCY } from "./index.js";

const CHUNK_AMOUNT = 10;

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
          CHUNK_AMOUNT,
        );

        const name = "backfill_chunk";
        await chunks_queue.addBulk(
          chunks.map((c) => ({
            name,
            data: {
              address: job.data.wallet.address,
              blockchain: job.data.wallet.blockchain,
              from_date: c.from_date.toISOString(),
              to_date: c.to_date.toISOString(),
              total_chunks: CHUNK_AMOUNT,
            },
          })),
        );
      } else {
        await chunks_queue.add("backfill_unique_chunk", {
          address: job.data.wallet.address,
          blockchain: job.data.wallet.blockchain,
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
      maxStalledCount: 5,
      concurrency: JOB_CONCURRENCY,
      limiter: {
        max: JOB_CONCURRENCY,
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
        const chunks = await wallets_service.getHistoryTimeChunks(
          wallet,
          CHUNK_AMOUNT,
        );

        const name = "backfill_chunk";
        await chunks_queue.addBulk(
          chunks.map((c) => ({
            name,
            data: {
              from_date: c.from_date.toISOString(),
              to_date: c.to_date.toISOString(),
              address: wallet.address,
              blockchain: wallet.blockchain,
              total_chunks: CHUNK_AMOUNT,
            },
          })),
        );
      } else {
        await chunks_queue.add("backfill_unique_chunk", {
          address: wallet.address,
          blockchain: wallet.blockchain,
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
  chunks_queue: Queue<BackfillChunkQueue>,
  redis_url: string,
): Worker<BackfillChunkQueue> => {
  const backfillChunkWorker = new Worker<BackfillChunkQueue>(
    "backfillChunkQueue",
    async (job) => {
      console.log(
        `Starting chunk job ${job.name} with ID ${job.id} for wallet: ${job.data.blockchain}:${job.data.address}.`,
        `From ${job.data.from_date} to ${job.data.to_date}`,
      );
      let loop_cursor: string | undefined = undefined;
      let transaction_count = 0;

      do {
        const { transactions, cursor } =
          await wallets_service.getTransactionHistory(
            job.data.address,
            job.data.blockchain,
            new Date(job.data.from_date),
            new Date(job.data.to_date),
            loop_cursor,
          );

        loop_cursor = cursor;

        if (transactions.length > 0) {
          // Guardo las [Transaction]s
          await wallets_service.saveTransactions(
            transactions.map((t) => ({
              ...t,
              block_timestamp: new Date(t.block_timestamp),
            })),
            job.data.blockchain,
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
      concurrency: JOB_CONCURRENCY,
      maxStalledCount: 5,
      removeOnComplete: {
        count: CHUNK_AMOUNT,
      },
      limiter: {
        max: JOB_CONCURRENCY,
        duration: 1000,
      },
    },
  );

  backfillChunkWorker.on("ready", () => {
    console.log("backfillChunkWorker is ready!");
  });

  backfillChunkWorker.on("completed", async (job) => {
    const { address, blockchain } = job.data;

    const jobs = await chunks_queue.getJobs(["completed"]);
    const chunk_jobs = jobs.filter(
      (j) => j.data.address === address && j.data.blockchain === blockchain,
    );

    console.log("Jobs completed: ", chunk_jobs.length);

    if (chunk_jobs.length >= job.data.total_chunks) {
      // Ya termino el último chunk
      // Termino el proceso
      await wallets_service.finishBackfill(address, blockchain);
      console.log(
        `Backfill process completed for wallet: ${blockchain}:${address}`,
      );
    }
  });

  backfillChunkWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} has failed with err: `, err);
  });

  return backfillChunkWorker;
};
