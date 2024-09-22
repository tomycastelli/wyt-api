import { serve } from "@hono/node-server";
import { Context, Hono } from "hono";
import { arktypeValidator } from "@hono/arktype-validator";
import { getPath } from "hono/utils/url";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { BlockainsName, blockchains, CoinsService } from "@repo/domain";
import { CoinGecko, CoinsPostgres } from "@repo/adapters";
import { type } from "arktype";
import "dotenv/config";
import { logger } from "./logger";
import { compress } from "hono/compress";

// El servidor Node
const app = new Hono();

app.onError((err, c) => {
  logger.error(err.message, {
    message: err.message,
    stack: err.stack,
  });
  console.error("Node server error", err);

  return c.text(`Internal Server Error: ${JSON.stringify(err)}`, 500);
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
    timestamp: new Date().getTime(),
  });
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// Funcion para sugerir coins
const suggestCoins = async (
  c: Context,
  coin_name: string,
): Promise<Response> => {
  const close_by_name_coins = await coins_service
    .searchCoinsByName(coin_name)
    .then((coins) => coins.map((c) => c.name));

  c.status(404);
  return c.json({ related_coins: close_by_name_coins });
};

// Los adapters
const coingecko = new CoinGecko(process.env.COINGECKO_API_KEY ?? "");
const coins_postgres = new CoinsPostgres(process.env.POSTGRES_URL ?? "");

// El servicio de Coins
const coins_service = new CoinsService(coins_postgres, coingecko);

const coins_routes = new Hono();

// Probando los jobs, estas llamadas al coins_service para guardar datos se pueden llamar desde un cronjob
// En lambda por ej
coins_routes.post("/coins-job", async (c) => {
  const coins = await coins_service.saveAllCoins();
  return c.json(coins);
});

coins_routes.post("/latest-coins-job", async (c) => {
  const coins = await coins_service.saveLatestCoins();
  return c.json(coins);
});

coins_routes.post(
  "/candles-job",
  arktypeValidator(
    "json",
    type({
      coin_name: "string",
      frequency: "'hourly'|'daily'",
      refresh_rate: "number",
    }),
  ),
  async (c) => {
    const { coin_name, frequency, refresh_rate } = c.req.valid("json");
    const coin = await coins_service.getCoinByName(coin_name);
    if (!coin) {
      return suggestCoins(c, coin_name);
    }
    await coins_service.saveCandles(coin.id, frequency, refresh_rate);
    const candles = await coins_service.getCandlesByDate(frequency, coin.id);
    return c.json(candles);
  },
);

coins_routes.get("/details/:coin_name", async (c) => {
  const coin_name = c.req.param("coin_name");

  const coin = await coins_service.getCoinByName(coin_name);

  if (!coin) {
    return suggestCoins(c, coin_name);
  }

  return c.json(coin);
});

coins_routes.get("/blockchains", async (c) => {
  return c.json({ blockchains });
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
    if (!(blockchain in blockchains)) {
      c.status(404);
      return c.json({ message: "invalid blockchain", blockchains });
    }
    const { page, name_search } = c.req.valid("query");

    const page_size = 30;
    const savedCoins = await coins_service.getCoinsByBlockchain(
      blockchain as BlockainsName,
      page ?? 1,
      page_size,
      name_search,
    );

    return c.json(savedCoins);
  },
);

const milisecond_timestamp = type("string").pipe((n) => new Date(Number(n)));

// Todas las candelas de la moneda segun un rango de timestamps en milisegundos
coins_routes.get(
  "candles/:coin_name/:candle_type",
  arktypeValidator(
    "param",
    type({ candle_type: "'hourly'|'daily'", coin_name: "string" }),
  ),
  arktypeValidator(
    "query",
    type({ "from?": milisecond_timestamp, "to?": milisecond_timestamp }),
  ),
  async (c) => {
    const { candle_type, coin_name } = c.req.valid("param");
    const { from, to } = c.req.valid("query");

    const coin = await coins_service.getCoinByName(coin_name);

    if (!coin) {
      return suggestCoins(c, coin_name);
    }

    const candles = await coins_service.getCandlesByDate(
      candle_type,
      coin.id,
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
