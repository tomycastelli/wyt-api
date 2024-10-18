import { arktypeValidator } from "@hono/arktype-validator";
import type {
  CoinGecko,
  CoinsPostgres,
  WalletsPostgres,
  WalletsProviderAdapters,
} from "@repo/adapters";
import {
  EveryBlockainsName,
  type SavedWallet,
  type WalletsService,
} from "@repo/domain";
import { type } from "arktype";
import { Queue } from "bullmq";
import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";
import { second_timestamp, validate_page } from "../index.js";

export const setup_wallets_routes = (
  wallets_service: WalletsService<
    WalletsProviderAdapters,
    WalletsPostgres,
    CoinGecko,
    CoinsPostgres
  >,
  base_url: string,
  redis_url: string,
): Hono<BlankEnv, BlankSchema, "/"> => {
  // BullMQ para procesos de larga duración
  const backfillQueue = new Queue<{
    wallet: SavedWallet;
  }>("backfillQueue", {
    connection: {
      host: redis_url,
      port: 6379,
    },
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: true,
    },
  });

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
      await backfillQueue.add("backfillWallet", {
        wallet: wallet_data.valued_wallet,
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
    "/list/:blockchain",
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
      }),
    ),
    async (c) => {
      const { blockchain } = c.req.valid("param");
      const { page, ids } = c.req.valid("query");

      if (page) {
        validate_page(page, c);
      }

      const wallets = await wallets_service.getValuedWalletsByBlockchain(
        blockchain,
        page ?? 1,
        ids,
      );

      return c.json(wallets);
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

      if (page) {
        validate_page(page, c);
      }

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
        "graph?": "'day'|'week'|'month'|'year'",
      }),
    ),
    async (c) => {
      const { blockchain, address } = c.req.valid("param");
      const { page, graph, transactions } = c.req.valid("query");

      if (page) {
        validate_page(page, c);
      }

      const wallet_with_tx = await wallets_service.getValuedWalletData(
        address,
        blockchain,
      );

      if (!wallet_with_tx) return c.notFound();

      const return_object: { [key: string]: any } = wallet_with_tx;

      if (graph) {
        const wallet_graph = await wallets_service.getWalletValueChangeGraph(
          wallet_with_tx,
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

  return wallets_routes;
};
