import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { arktypeValidator } from "@hono/arktype-validator";
import { getPath } from "hono/utils/url";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { CoinsService } from "./domain/coins.service";
import { type } from "arktype";
import "dotenv/config";
import { logger } from "./logger";

// El servidor Node
const app = new Hono();

app.onError((err, c) => {
  logger.error(err.message, {
    message: err.message,
    stack: err.stack,
  });
  console.error("Node server error", err);

  return c.text(`Internal Server Error: ${err}`, 500);
});

// Genera un request-id
app.use("*", requestId());

// Redirecciona /api/ejemplo/ a /api/ejemplo
app.use(trimTrailingSlash());

// Formatea el JSON que devuelve la api para mejor redibilidad
app.use(prettyJSON());

// Logging a winston, la libreria recomendada por DataDog
app.use(async (c, next) => {
  const { method } = c.req;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const path = getPath(c.req.raw);

  const request_id = c.get("requestId");

  logger.log("info", { request_id, path, method });

  const start = Date.now();

  await next();

  const delta = Date.now() - start;

  logger.log("info", {
    request_id,
    path,
    method,
    status: c.res.status,
    duration_ms: delta,
  });
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// El servicio de Coins
const coins_service = new CoinsService(
  process.env.POSTGRES_URL ?? "",
  process.env.COINGECKO_API_KEY ?? "",
);

const coins_routes = new Hono();

// Probando el cronjob
coins_routes.get("/run-coins-job", async (c) => {
  const coins = await coins_service.saveAllCoins();
  return c.json(coins);
});

coins_routes.get("/details/:coin_name", async (c) => {
  const coin_name = c.req.param("coin_name");

  const coin = await coins_service.getCoinByName(coin_name);
  return c.json(coin);
});

// Todas las coins por blockchain, paginadas y ordenadas por marketcap
coins_routes.get(
  "/:blockchain",
  arktypeValidator(
    "query",
    type({ "page?": "number", "name_search?": "string" }),
  ),
  async (c) => {
    const blockchain = c.req.param("blockchain");
    const { page, name_search } = c.req.valid("query");

    const page_size = 30;
    const savedCoins = await coins_service.getCoinsByBlockchain(
      blockchain,
      page ?? 1,
      page_size,
      name_search,
    );

    return c.json(savedCoins);
  },
);

const milisecond_timestamp = type("number").pipe((n) => new Date(n));

// Todas las candelas de la moneda segun un rango de timestamps en milisegundos
coins_routes.get(
  "candles/:coin_name/:candle_type",
  arktypeValidator(
    "param",
    type({ candle_type: "'hourly'|'daily'", coin_name: "string" }),
  ),
  arktypeValidator(
    "query",
    type({ from: milisecond_timestamp, to: milisecond_timestamp }),
  ),
  async (c) => {
    const { candle_type, coin_name } = c.req.valid("param");
    const { from, to } = c.req.valid("query");

    const { id: coin_id } = await coins_service.getCoinByName(coin_name);

    const candles = await coins_service.getCandlesByDate(
      candle_type,
      coin_id,
      from,
      to,
    );
    return c.json(candles);
  },
);

app.route("/coins", coins_routes);

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
