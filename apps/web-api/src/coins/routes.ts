import { arktypeValidator } from "@hono/arktype-validator";
import type { CoinGecko, CoinsPostgres } from "@repo/adapters";
import {
	type BlockchainsName,
	type CoinsService,
	blockchains,
} from "@repo/domain";
import { type } from "arktype";
import type { Queue } from "bullmq";
import { type Context, Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";
import type { JobsQueue } from "../index.js";

export const setup_coins_routes = (
	coins_service: CoinsService<CoinGecko, CoinsPostgres>,
	coin_jobs_queue: Queue<JobsQueue>,
): Hono<BlankEnv, BlankSchema, "/"> => {
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

	const coins_routes = new Hono();

	coins_routes.post("/coins-job", async (c) => {
		await coin_jobs_queue.add("coins-job", {
			jobName: "saveAllCoins",
		});

		return c.text("Coins job started");
	});

	coins_routes.post("/latest-coins-job", async (c) => {
		await coin_jobs_queue.add("latest-coins-job", {
			jobName: "saveLatestCoins",
		});
		return c.text("Latest coins job started");
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

			if (!coin) return c.text("Coin does not exists");

			await coin_jobs_queue.add("candles-job", {
				jobName: "candles",
				data: {
					coin,
					frequency,
					refresh_rate,
				},
			});

			return c.text("Candles job started");
		},
	);

	coins_routes.post(
		"/historical-candles-job",
		arktypeValidator(
			"json",
			type({
				coin_name: "string",
				frequency: "'hourly'|'daily'",
			}),
		),
		async (c) => {
			const { coin_name, frequency } = c.req.valid("json");

			const coin = await coins_service.getCoinByName(coin_name);

			if (!coin) return c.text("Coin does not exists");

			await coin_jobs_queue.add("historical-candles-job", {
				jobName: "historicalCandles",
				data: {
					coin,
					frequency,
				},
			});

			return c.text("Historical candles job started");
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
				blockchain as BlockchainsName,
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

	return coins_routes;
};
