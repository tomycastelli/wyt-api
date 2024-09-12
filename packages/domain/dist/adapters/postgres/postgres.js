import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { base_coins } from "../../core/vars";
export default class CoinsPostgres {
    db;
    constructor(connection_string) {
        const queryClient = postgres(connection_string);
        this.db = drizzle(queryClient, { schema });
    }
    async saveCoins(coins) {
        const response = await this.db.transaction(async (tx) => {
            const savedCoins = await tx
                .insert(schema.coins)
                .values(coins)
                .returning();
            const flattenedContracts = coins.flatMap((c) => c.contracts
                ? c.contracts.map((contract) => ({
                    ...contract,
                    coin_id: savedCoins.find((sv) => sv.name === c.name).id,
                }))
                : []);
            const mappedCoins = savedCoins.map((c) => ({
                id: c.id,
                description: c.description,
                symbol: c.symbol,
                image_url: c.image_url,
                provider: c.provider,
                name: c.name,
                market_cap: c.market_cap,
                price: c.price,
                price_change_24h: c.price_change_24h,
                ath: c.ath,
                contracts: [],
            }));
            if (flattenedContracts.length > 0) {
                // Guardo los contratos y sus address
                const savedContracts = await tx
                    .insert(schema.contracts)
                    .values(flattenedContracts)
                    .returning();
                savedContracts.forEach((sc) => {
                    mappedCoins.find((c) => c.id === sc.coin_id)?.contracts.push(sc);
                });
            }
            return mappedCoins;
        });
        return response;
    }
    async getAllCoins() {
        const allCoins = await this.db.select().from(schema.coins);
        const contractsData = await this.db.select().from(schema.contracts);
        const mappedCoins = allCoins.map((c) => {
            const contracts = contractsData
                .filter((contract) => contract.coin_id === c.id)
                .map((contract) => ({
                blockchain: contract.blockchain,
                address: contract.address,
            }));
            return {
                ...c,
                contracts,
            };
        });
        return mappedCoins;
    }
    async getCoinById(id) {
        const coin = await this.db.query.coins.findFirst({
            where: (coins, { eq }) => eq(coins.id, id),
            with: {
                contracts: true,
            },
        });
        return coin;
    }
    async getCoinByName(coin_name) {
        const coin = await this.db.query.coins.findFirst({
            where: (coins, { eq }) => eq(coins.name, coin_name),
            with: {
                contracts: true,
            },
        });
        return coin;
    }
    async saveCandles(candles) {
        await this.db
            .insert(schema.candles)
            .values(candles)
            .onConflictDoUpdate({
            target: [
                schema.candles.coin_id,
                schema.candles.frequency,
                schema.candles.timestamp,
            ],
            set: {
                open: sql.raw(`excluded.${schema.candles.open.name}`),
                high: sql.raw(`excluded.${schema.candles.high.name}`),
                close: sql.raw(`excluded.${schema.candles.close.name}`),
                low: sql.raw(`excluded.${schema.candles.low.name}`),
            },
        });
    }
    async getCandles(frequency, coin_id, from_date, to_date) {
        const candles = await this.db
            .select()
            .from(schema.candles)
            .where(and(eq(schema.candles.coin_id, coin_id), eq(schema.candles.frequency, frequency), gte(schema.candles.timestamp, from_date), lte(schema.candles.timestamp, to_date)));
        return candles;
    }
    async getCoinsByBlockchain(blockchain, page_number, page_size, name_search) {
        const base_coin = base_coins.find((c) => c === blockchain);
        const coinsData = await this.db.query.coins.findMany({
            with: {
                contracts: {
                    where: eq(schema.contracts.blockchain, blockchain),
                },
            },
            where: and(base_coin ? eq(schema.coins.name, base_coin) : undefined, name_search
                ? sql `to_tsvector('english', ${schema.coins.name}) @@ to_tsquery('english', ${name_search})`
                : undefined),
            offset: (page_number - 1) * page_size,
            limit: page_size,
            orderBy: (coins, { desc }) => [desc(coins.market_cap)],
        });
        return coinsData;
    }
    async saveMarketData(coin_market_data) {
        const names = [];
        const sqlChunks = [[], [], []];
        sqlChunks[0].push(sql `(case`);
        sqlChunks[1].push(sql `(case`);
        sqlChunks[2].push(sql `(case`);
        for (const coin of coin_market_data) {
            sqlChunks[0].push(sql `when ${schema.coins.name} = ${coin.name} then ${coin.price}`);
            sqlChunks[1].push(sql `when ${schema.coins.name} = ${coin.name} then ${coin.market_cap}`);
            sqlChunks[2].push(sql `when ${schema.coins.name} = ${coin.name} then ${coin.ath}`);
            names.push(coin.name);
        }
        sqlChunks[0].push(sql `end)`);
        sqlChunks[1].push(sql `end)`);
        sqlChunks[2].push(sql `end)`);
        const finalSql1 = sql.join(sqlChunks[0], sql.raw(" "));
        const finalSql2 = sql.join(sqlChunks[1], sql.raw(" "));
        const finalSql3 = sql.join(sqlChunks[2], sql.raw(" "));
        await this.db
            .update(schema.coins)
            .set({ price: finalSql1, market_cap: finalSql2, ath: finalSql3 })
            .where(inArray(schema.coins.name, names));
    }
}
