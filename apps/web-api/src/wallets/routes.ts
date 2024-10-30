import { arktypeValidator } from "@hono/arktype-validator";
import type {
  CoinGecko,
  CoinsPostgres,
  WalletsPostgres,
  WalletsProviderAdapters,
} from "@repo/adapters";
import {
  type BlockchainsName,
  EveryBlockainsName,
  type WalletsService,
} from "@repo/domain";
import { type } from "arktype";
import type { Queue } from "bullmq";
import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";
import { type WalletJobsQueue, second_timestamp } from "../index.js";

export const setup_wallets_routes = (
  wallets_service: WalletsService<
    WalletsProviderAdapters,
    WalletsPostgres,
    CoinGecko,
    CoinsPostgres
  >,
  base_url: string,
  backfill_queue: Queue<{
    address: string;
    blockchain: BlockchainsName;
  }>,
  wallet_jobs_queue: Queue<WalletJobsQueue>,
): Hono<BlankEnv, BlankSchema, "/"> => {
  const wallets_routes = new Hono();

  wallets_routes.post(
    "/add",
    arktypeValidator(
      "json",
      type({
        address: "string",
        blockchain: ["===", ...EveryBlockainsName],
      }),
    ),
    async (c) => {
      const { address, blockchain } = c.req.valid("json");

      const wallet_data = await wallets_service.addWallet(
        address,
        blockchain,
        `${base_url}/streams/${blockchain}`,
      );

      if (!wallet_data) return c.text("Invalid wallet address", 400);

      // Enviar a una queue
      await backfill_queue.add("backfillWallet", {
        address: wallet_data.valued_wallet.address,
        blockchain: wallet_data.valued_wallet.blockchain,
      });

      return c.json(wallet_data.valued_wallet);
    },
  );

  wallets_routes.post(
    "/update/:blockchain/:address",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
        address: "string",
      }),
    ),
    async (c) => {
      const { blockchain, address } = c.req.valid("param");

      const wallet_with_tx = await wallets_service.getWallet(
        address,
        blockchain,
      );

      if (!wallet_with_tx) return c.notFound();

      await wallets_service.updateWallet(wallet_with_tx);

      return c.text("Wallet updated", 200);
    },
  );

  wallets_routes.get(
    "/transactions/:blockchain/:address",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
        address: type("string"),
      }),
    ),
    arktypeValidator(
      "query",
      type({
        "page?": type("string").pipe((s) => Number.parseInt(s)),
        "from?": second_timestamp,
        "to?": second_timestamp,
      }),
    ),
    async (c) => {
      const { blockchain, address } = c.req.valid("param");
      const { page, from, to } = c.req.valid("query");

      console.log({ blockchain, address, page });

      if (page !== undefined) {
        if (page < 1) {
          return c.json({ error: `invalid page (${page} is less than 1)` });
        }
      }

      if (!(await wallets_service.walletExists(address, blockchain))) {
        return c.notFound();
      }

      // Mando a actualizar la wallet
      wallet_jobs_queue.add("update wallet by transactions fetched", {
        jobName: "updateOneWallet",
        data: {
          wallet: {
            address,
            blockchain,
          },
        },
      });

      const transactions = await wallets_service.getTransactionsByWallet(
        address,
        blockchain,
        page ?? 1,
        from,
        to,
      );

      return c.json(transactions);
    },
  );

  wallets_routes.get(
    "/:blockchain/:address",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
        address: type("string"),
      }),
    ),
    arktypeValidator(
      "query",
      type({
        "page?": type("string").pipe((s) => Number.parseInt(s)),
        "transactions?": type("'true'|'false'").pipe((s) => s === "true"),
        "graph?": "'day'|'week'|'month'",
      }),
    ),
    async (c) => {
      const { blockchain, address } = c.req.valid("param");
      const { page, graph, transactions } = c.req.valid("query");

      if (page !== undefined) {
        if (page < 1) {
          return c.json({ error: `invalid page (${page} is less than 1)` });
        }
      }

      const wallet_data = await wallets_service.getValuedWalletData(
        address,
        blockchain,
      );

      if (!wallet_data) return c.notFound();

      // Mando a actualizar la wallet
      wallet_jobs_queue.add("update fetched wallet", {
        jobName: "updateOneWallet",
        data: {
          wallet: {
            address,
            blockchain,
          },
        },
      });

      const return_object: { [key: string]: any } = wallet_data;

      if (graph) {
        const wallet_graph = await wallets_service.getWalletValueChangeGraph(
          wallet_data,
          graph,
        );
        return_object.graph = wallet_graph;
      }

      if (transactions === true) {
        const transaction_data = await wallets_service.getTransactionsByWallet(
          address,
          blockchain,
          page ?? 1,
          undefined,
          undefined,
        );

        return_object.transactions = transaction_data;
      }

      return c.json(return_object);
    },
  );

  wallets_routes.get(
    "/:blockchain",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
      }),
    ),
    arktypeValidator(
      "query",
      type({
        "page?": type("string").pipe((s) => Number.parseInt(s)),
        "ids?": type("string[]").pipe((strs) =>
          strs.map((s) => Number.parseInt(s)),
        ),
        "include_nfts?": type("'true'|'false'").pipe((s) => s === "true"),
      }),
    ),
    async (c) => {
      const { blockchain } = c.req.valid("param");
      const { page, ids, include_nfts } = c.req.valid("query");

      if (page !== undefined) {
        if (page < 1) {
          return c.json({ error: `invalid page (${page} is less than 1)` });
        }
      }

      const wallets = await wallets_service.getValuedWalletsByBlockchain(
        blockchain,
        page ?? 1,
        ids,
        include_nfts === true,
      );

      return c.json(wallets);
    },
  );

  return wallets_routes;
};
