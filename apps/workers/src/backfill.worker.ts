import {
  type CoinsProvider,
  type CoinsRepository,
  type SavedWallet,
  type WalletsRepository,
  type WalletsService,
  type WalletsStreamsProvider,
  blockchains,
} from "@repo/domain";
import { type Queue, type QueueEvents, Worker } from "bullmq";
import {
  type BackfillChunkQueue,
  CHUNK_AMOUNT,
  JOB_CONCURRENCY,
} from "./index.js";

export const setupBackfillWorker = (
  wallets_service: WalletsService<
    WalletsStreamsProvider,
    WalletsRepository,
    CoinsProvider,
    CoinsRepository
  >,
  chunk_queue_events: Queue<BackfillChunkQueue>,
  queue_events: QueueEvents,
  redis_url: string,
): Worker<{
  wallet: SavedWallet;
}> => {
  const add_chunks = async (wallet: SavedWallet): Promise<void> => {
    let first_date: Date = new Date();
    const ecosystem = blockchains[wallet.blockchain].ecosystem;

    if (ecosystem === "ethereum") {
      // Consigo los chunks
      const { chunks, first_date: first_date_from_history } =
        await wallets_service.getHistoryTimeChunks(wallet, CHUNK_AMOUNT);

      first_date = first_date_from_history;

      const name = "backfill_chunk";
      const job_ids = await chunk_queue_events
        .addBulk(
          chunks.map((c) => ({
            name,
            data: {
              from_block: c.from_block,
              to_block: c.to_block,
              address: wallet.address,
              blockchain: wallet.blockchain,
              total_chunks: CHUNK_AMOUNT,
            },
            opts: {
              // Con prioridad 1 ya van a ir detras del resto de trabajos
              priority: 1,
            },
          })),
        )
        .then((added_jobs) => added_jobs.map((job) => job.id));

      await new Promise<void>((resolve, reject) => {
        let completed_count = 0;

        const checkCompletion = (job_id: string) => {
          if (job_ids.includes(job_id)) {
            completed_count++;
            console.log(
              `Completion: ${completed_count} out of ${job_ids.length}`,
            );
            if (completed_count === job_ids.length) {
              queue_events.off("completed", () => {
                return;
              });
              queue_events.off("failed", () => {
                return;
              });
              resolve();
            }
          }
        };

        queue_events.on("completed", ({ jobId }) => {
          checkCompletion(jobId);
        });

        queue_events.on("failed", (data) => {
          reject(new Error(`Job ${data.jobId} failed: ${data.failedReason}`));
        });
      });
    } else {
      const job = await chunk_queue_events.add(
        "backfill_unique_chunk",
        {
          address: wallet.address,
          blockchain: wallet.blockchain,
          // Si no es ethereum el ecosistema, no se usan
          from_block: 0,
          to_block: 0,
          total_chunks: 1,
        },
        {
          priority: 1,
        },
      );

      const result = await job.waitUntilFinished(queue_events);
      if (await job.isCompleted()) {
        // El result es el date
        first_date = result as Date;
      } else {
        throw Error(`Job ${job.id} failed: ${job.failedReason}`);
      }
    }

    // Termino el proceso
    await wallets_service.changeBackfillStatus(
      wallet.address,
      wallet.blockchain,
      "complete",
      first_date,
    );

    console.log(
      "Finished backfill process with first transfer date: ",
      first_date,
    );
  };

  const backfillWorker = new Worker<{
    wallet: SavedWallet;
  }>(
    "backfillQueue",
    async (job) => {
      console.log(
        `Starting backfill for wallet: ${job.data.wallet.blockchain}:${job.data.wallet.address}`,
      );

      await add_chunks(job.data.wallet);
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
      lockDuration: 600_000,
    },
  );

  backfillWorker.on("ready", async () => {
    chunk_queue_events.clean(0, 1000, "active");
    chunk_queue_events.clean(0, 1000, "delayed");
    chunk_queue_events.clean(0, 1000, "wait");
    console.log("backfillWorker is ready!");
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
  _chunks_queue: Queue<BackfillChunkQueue>,
  redis_url: string,
): Worker<BackfillChunkQueue> => {
  const backfillChunkWorker = new Worker<BackfillChunkQueue>(
    "backfillChunkQueue",
    async (job) => {
      console.log(
        `Starting chunk job ${job.name} with ID ${job.id} for wallet: ${job.data.blockchain}:${job.data.address}.`,
        `From ${job.data.from_block} to ${job.data.to_block}`,
      );
      let loop_cursor: string | undefined = undefined;
      let transaction_count = 0;
      let first_date: Date = new Date();

      do {
        const { transactions, cursor } =
          await wallets_service.getTransactionHistory(
            job.data.address,
            job.data.blockchain,
            job.data.from_block,
            job.data.to_block,
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

          first_date = transactions[transactions.length - 1]!.block_timestamp;

          await job.updateProgress({ transaction_count: transaction_count });
        }
      } while (loop_cursor);

      return first_date;
    },
    {
      connection: {
        host: redis_url,
        port: 6379,
      },
      concurrency: JOB_CONCURRENCY,
      maxStalledCount: 5,
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
    console.log(
      `Finished chunk ${job.id} for wallet: ${blockchain}:${address}`,
    );
  });

  backfillChunkWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} has failed with err: `, err);
  });

  return backfillChunkWorker;
};
