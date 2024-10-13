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
  type SavedWallet,
  type WalletsService,
} from "@repo/domain";
import { type } from "arktype";
import { Queue } from "bullmq";
import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

export const setup_wallets_routes = (
  wallets_service: WalletsService<
    WalletsProviderAdapters,
    WalletsPostgres,
    CoinGecko,
    CoinsPostgres
  >,
  base_url: string,
  moralis_streams_secret_key: string,
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
  });

  const transactionsStreamQueue = new Queue<{
    body: any;
    blockchain: BlockchainsName;
  }>("transactionsStreamQueue", {
    connection: {
      host: redis_url,
      port: 6379,
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
    "/streams/:blockchain",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
      }),
    ),
    async (c) => {
      const { blockchain } = c.req.valid("param");

      const body = await c.req.json();
      const headers = c.req.header();

      // Verifico y proceso la transacción enviada
      const is_valid = wallets_service.validateWebhookTransaction(
        body,
        moralis_streams_secret_key,
        headers,
      );

      if (!is_valid) return c.text("Unauthorized webhook", 401);

      await transactionsStreamQueue.add("transactionsStream", {
        body,
        blockchain,
      });

      return c.text("Webhook recibido");
    },
  );

  wallets_routes.post(
    "/update/:blockchain/:address",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
        address: type("string"),
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
        "page?": "number.integer > 0",
        "ids?": "number.integer[]",
      }),
    ),
    async (c) => {
      const { blockchain } = c.req.valid("param");
      const { page, ids } = c.req.valid("query");

      const wallets = await wallets_service.getValuedWalletsByBlockchain(
        blockchain,
        page ?? 1,
        ids,
      );

      return c.json(wallets);
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
        "page?": "number.integer > 0",
        "graph?": "'day'|'week'|'month'|'year'",
      }),
    ),
    async (c) => {
      const { blockchain, address } = c.req.valid("param");
      const { page, graph } = c.req.valid("query");

      const wallet_with_tx = await wallets_service.getWalletWithTransactions(
        address,
        blockchain,
        page ?? 1,
      );

      if (!wallet_with_tx) return c.notFound();

      if (graph) {
        const wallet_graph = await wallets_service.getWalletValueChangeGraph(
          wallet_with_tx,
          graph,
        );
        return c.json({ ...wallet_with_tx, wallet_graph });
      }

      return c.json(wallet_with_tx);
    },
  );

  return wallets_routes;
};
