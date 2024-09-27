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
): Hono<BlankEnv, BlankSchema, "/"> => {
  // BullMQ para procesos de larga duración
  const backfillQueue = new Queue<{
    wallet: SavedWallet;
    stream_webhook_url: string;
  }>("backfillQueue", {
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
  });

  const transactionsStreamQueue = new Queue<{
    body: any;
    blockchain: BlockchainsName;
  }>("transactionsStreamQueue", {
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
  });

  const wallets_routes = new Hono();

  wallets_routes.post(
    "/add",
    arktypeValidator(
      "json",
      type({
        address: type("string").pipe((s) => s.toLowerCase()),
        blockchain: ["===", ...EveryBlockainsName],
      }),
    ),
    async (c) => {
      const { address, blockchain } = c.req.valid("json");

      const wallet_with_tx = await wallets_service.addWallet(
        address,
        blockchain,
      );

      // Enviar a una queue
      await backfillQueue.add("backfillWallet", {
        wallet: wallet_with_tx,
        stream_webhook_url: `${base_url}/streams/${blockchain}`,
      });

      return c.json(wallet_with_tx);
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

  wallets_routes.get(
    "/wallet/:blockchain/:address",
    arktypeValidator(
      "param",
      type({
        blockchain: ["===", ...EveryBlockainsName],
        address: type("string").pipe((s) => s.toLowerCase()),
      }),
    ),
    async (c) => {
      const { blockchain, address } = c.req.valid("param");
      const wallet_with_tx = await wallets_service.getWallet(
        address,
        blockchain,
        1,
      );

      if (!wallet_with_tx) return c.notFound();

      return c.json(wallet_with_tx);
    },
  );

  return wallets_routes;
};
