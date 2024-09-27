import { CoinsPostgres, WalletsPostgres } from "@repo/adapters";
import { CoinsService, WalletsService } from "@repo/domain";
import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";
import { create_app } from "..";
import { mockCoinsProvider, mockWalletsProvider } from "./mocks";

describe.concurrent("wallets_handlers", () => {
	let postgres_container: StartedPostgreSqlContainer;
	let app: Hono<BlankEnv, BlankSchema, "/">;

	beforeAll(async () => {
		const POSTGRES_USER = "test";
		const POSTGRES_PASSWORD = "test";
		const POSTGRES_DB = "test";
		postgres_container = await new PostgreSqlContainer()
			.withEnvironment({
				POSTGRES_USER,
				POSTGRES_PASSWORD,
				POSTGRES_DB,
			})
			.withExposedPorts(5432)
			.start();

		const connection_string = `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${postgres_container.getHost()}:${postgres_container.getFirstMappedPort()}/${POSTGRES_DB}`;
		const client = postgres(connection_string);
		const db = drizzle(client);

		await migrate(db, {
			migrationsFolder: "./migrations",
		});

		// Confirmo que esta lista
		await db.execute(sql`SELECT 1`);

		const coins_repository = new CoinsPostgres(connection_string);
		const coins_service = new CoinsService(coins_repository, mockCoinsProvider);

		const wallets_repository = new WalletsPostgres(connection_string);
		const wallets_service = new WalletsService(
			wallets_repository,
			mockWalletsProvider,
			coins_service,
		);

		// Creo la app
		app = create_app(
			coins_service,
			wallets_service,
			"http://localhost:3000",
			"nose",
		);

		// Cleanup func
		return async () => {
			await postgres_container.stop();
		};
	});

	it();
});
