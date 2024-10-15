import { serve } from "@hono/node-server";
import {
  CoinGecko,
  CoinsPostgres,
  WalletsPostgres,
  WalletsProviderAdapters,
} from "@repo/adapters";
import {
  type BlockchainsName,
  CoinsService,
  EveryBlockainsName,
  WalletsService,
  blockchains,
} from "@repo/domain";
import { type Context, Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { getPath } from "hono/utils/url";
import "dotenv/config";
import { arktypeValidator } from "@hono/arktype-validator";
import { type } from "arktype";
import { Queue } from "bullmq";
import { bearerAuth } from "hono/bearer-auth";
import { compress } from "hono/compress";
import type { BlankEnv, BlankSchema } from "hono/types";
import { setup_coins_routes } from "./coins/routes.js";
import { logger } from "./logger.js";
import { setup_wallets_routes } from "./wallets/routes.js";

// Deserialización de BigInts
declare global {
  interface BigInt {
    toJSON(): number;
  }
}

BigInt.prototype.toJSON = function () {
  return Number(this);
};

export const validate_page = (page: number, c: Context) => {
  if (page < 1) {
    return c.json({ error: `invalid page (${page} is less than 1)` });
  }
};

// Parsea una string de unix timestamp en segundos a una Date
export const second_timestamp = type("string").pipe(
  (n) => new Date(Number(n) * 1000),
);

export const create_app = (
  coins_service: CoinsService<CoinGecko, CoinsPostgres>,
  wallets_service: WalletsService<
    WalletsProviderAdapters,
    WalletsPostgres,
    CoinGecko,
    CoinsPostgres
  >,
  base_url: string,
  moralis_streams_secret_key: string,
  redis_url: string,
  api_token: string,
): Hono<BlankEnv, BlankSchema, "/"> => {
  // El servidor Node
  const app = new Hono();

  app.onError((err, c) => {
    logger.error(err.message, {
      message: err.message,
      stack: err.stack,
    });
    console.error("Node server error", err);

    return c.json({ error: err.message }, 500);
  });

  // Genera un request-id
  app.use("*", requestId());

  // Redirecciona /api/ejemplo/ a /api/ejemplo
  app.use(trimTrailingSlash());

  // Formatea el JSON que devuelve la api para mejor redibilidad
  app.use(prettyJSON());

  // Compresión de gzip o deflate de acuerdo al Accept-Encoding header, defaultea a gzip
  app.use(compress());

  // Logging a winston, la libreria recomendada por DataDog
  app.use(async (c, next) => {
    const { method } = c.req;
    const path = getPath(c.req.raw);

    const request_id = c.get("requestId");

    logger.log("info", { request_id, path, method });
    console.log("info", { request_id, path, method });

    const start = Date.now();

    await next();

    const delta = Date.now() - start;

    logger.log("info", {
      request_id,
      path,
      method,
      status: c.res.status,
      duration_ms: delta,
      timestamp: new Date().getTime(),
    });
    console.log("info", {
      request_id,
      path,
      method,
      status: c.res.status,
      duration_ms: delta,
      timestamp: new Date().getTime(),
    });
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

  const coins_routes = setup_coins_routes(coins_service);
  const wallets_routes = setup_wallets_routes(
    wallets_service,
    base_url,
    redis_url,
  );

  app.get("/", (c) => {
    return c.text("Wallets y Tokens API running");
  });

  app.get("/blockchains", async (c) => {
    return c.json({ blockchains });
  });

  app.post(
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

      console.log("Stream body: ", body);

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

  app.use(
    "/coins/*",
    bearerAuth({
      verifyToken: async (token) => {
        return token === api_token;
      },
    }),
  );
  app.use(
    "/wallets/*",
    bearerAuth({
      verifyToken: async (token) => {
        return token === api_token;
      },
    }),
  );

  app.route("/coins", coins_routes);
  app.route("/wallets", wallets_routes);

  return app;
};

// Enviroment variables

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw Error("BASE_URL missing");

const MORALIS_STREAMS_SECRET_KEY = process.env.MORALIS_STREAMS_SECRET_KEY;
if (!MORALIS_STREAMS_SECRET_KEY)
  throw Error("MORALIS_STREAMS_SECRET_KEY missing");

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw Error("REDIS_URL missing");

const API_TOKEN = process.env.API_TOKEN;
if (!API_TOKEN) throw Error("API_TOKEN missing");

// Los adapters
const coingecko = new CoinGecko(process.env.COINGECKO_API_KEY ?? "");
const coins_postgres = new CoinsPostgres(process.env.POSTGRES_URL ?? "");

// El servicio de Coins
const coins_service = new CoinsService(coins_postgres, coingecko);

const wallets_repository = new WalletsPostgres(process.env.POSTGRES_URL ?? "");
const wallets_provider = new WalletsProviderAdapters(
  process.env.MORALIS_API_KEY ?? "",
  [
    { url: process.env.QUICKNODE_SOLANA_RPC ?? "", weight: 30 },
    { url: process.env.ALCHEMY_SOLANA_RPC ?? "", weight: 70 },
  ],
);

await wallets_provider.initialize();

// El servicio de Wallets
const wallets_service = new WalletsService(
  wallets_repository,
  wallets_provider,
  coins_service,
);

const app = create_app(
  coins_service,
  wallets_service,
  BASE_URL,
  MORALIS_STREAMS_SECRET_KEY,
  REDIS_URL,
  API_TOKEN,
);

const port = 80;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
