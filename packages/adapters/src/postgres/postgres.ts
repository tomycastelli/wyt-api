import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { and, count, eq, gte, inArray, lte, or, SQL, sql } from "drizzle-orm";
import {
  base_coins,
  CoinsRepository,
  Coin,
  Candle,
  CoinMarketData,
  SavedCoin,
} from "@repo/domain";

export class CoinsPostgres implements CoinsRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(connection_string: string) {
    const queryClient = postgres(connection_string);
    this.db = drizzle(queryClient, { schema });
  }

  async saveCoins(coins: Coin[]): Promise<SavedCoin[]> {
    const response = await this.db.transaction(async (tx) => {
      // Actualizo los datos asociados a la coin si ya existe su nombre
      const savedCoins = await tx
        .insert(schema.coins)
        .values(coins)
        .onConflictDoUpdate({
          target: [schema.coins.name],
          set: {
            price: sql.raw(`excluded.${schema.coins.price.name}`),
            ath: sql.raw(`excluded.${schema.coins.ath.name}`),
            market_cap: sql.raw(`excluded.${schema.coins.market_cap.name}`),
            description: sql.raw(`excluded.${schema.coins.description.name}`),
            image_url: sql.raw(`excluded.${schema.coins.image_url.name}`),
            price_change_24h: sql.raw(
              `excluded.${schema.coins.price_change_24h.name}`,
            ),
            symbol: sql.raw(`excluded.${schema.coins.symbol.name}`),
            provider: sql.raw(`excluded.${schema.coins.provider.name}`),
          },
        })
        .returning();

      const flattenedContracts = coins.flatMap((c) =>
        c.contracts
          ? c.contracts.map((contract) => ({
              ...contract,
              coin_id: savedCoins.find((sv) => sv.name === c.name)!.id,
            }))
          : [],
      );

      const mappedCoins: SavedCoin[] = savedCoins.map((c) => ({
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
        // Actualizo la address si ya existe esta combinacion
        const savedContracts = await tx
          .insert(schema.contracts)
          .values(flattenedContracts)
          .onConflictDoUpdate({
            target: [schema.contracts.coin_id, schema.contracts.blockchain],
            set: {
              address: sql.raw(`excluded.${schema.contracts.address.name}`),
            },
          })
          .returning();

        savedContracts.forEach((sc) => {
          mappedCoins.find((c) => c.id === sc.coin_id)?.contracts.push(sc);
        });
      }

      return mappedCoins;
    });

    return response;
  }

  async getAllCoins(): Promise<SavedCoin[]> {
    const coinsData = await this.db.query.coins.findMany({
      with: {
        contracts: true,
      },
      orderBy: (coins, { desc }) => [desc(coins.market_cap)],
    });

    return coinsData;
  }

  async getCoinById(id: number): Promise<SavedCoin | undefined> {
    const coin = await this.db.query.coins.findFirst({
      where: (coins, { eq }) => eq(coins.id, id),
      with: {
        contracts: true,
      },
    });

    return coin!;
  }

  async getCoinByName(coin_name: string): Promise<SavedCoin | undefined> {
    const coin = await this.db.query.coins.findFirst({
      where: (coins, { eq }) => eq(coins.name, coin_name),
      with: {
        contracts: true,
      },
    });

    return coin;
  }

  async saveCandles(candles: Candle[]): Promise<void> {
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

  async getCandles(
    frequency: "hourly" | "daily",
    coin_id: number,
    from_date: Date,
    to_date: Date,
  ): Promise<Candle[]> {
    const candles = await this.db
      .select()
      .from(schema.candles)
      .where(
        and(
          eq(schema.candles.coin_id, coin_id),
          eq(schema.candles.frequency, frequency),
          gte(schema.candles.timestamp, from_date),
          lte(schema.candles.timestamp, to_date),
        ),
      );

    return candles;
  }

  async getCoinsByBlockchain(
    blockchain: string,
    page_number: number,
    page_size: number,
  ): Promise<SavedCoin[]> {
    const base_coin = base_coins.find((c) => c === blockchain);
    const coinsData = await this.db
      .select()
      .from(schema.coins)
      .leftJoin(schema.contracts, eq(schema.coins.id, schema.contracts.coin_id))
      .where(
        or(
          eq(schema.contracts.blockchain, blockchain),
          base_coin ? eq(schema.coins.name, base_coin) : undefined,
        ),
      )
      .offset((page_number - 1) * page_size)
      .limit(page_size);

    const mappedCoins = coinsData.reduce((acc, item) => {
      const coin = item.coins!;
      const acc_coin = acc.find((c) => c.id === coin.id);

      if (acc_coin) {
        if (item.contracts) {
          acc_coin.contracts.push({
            blockchain: item.contracts.blockchain,
            address: item.contracts.blockchain,
          });
        }
      } else {
        acc.push({
          ...coin,
          contracts: item.contracts
            ? [
                {
                  blockchain: item.contracts.blockchain,
                  address: item.contracts.address,
                },
              ]
            : [],
        });
      }

      return acc;
    }, [] as SavedCoin[]);

    return mappedCoins;
  }

  async saveMarketData(coin_market_data: CoinMarketData[]): Promise<void> {
    const names: string[] = [];
    const sqlChunks: [SQL[], SQL[], SQL[]] = [[], [], []];
    sqlChunks[0].push(sql`(case`);
    sqlChunks[1].push(sql`(case`);
    sqlChunks[2].push(sql`(case`);

    for (const coin of coin_market_data) {
      sqlChunks[0].push(
        sql`when ${schema.coins.name} = ${coin.name} then ${coin.price}`,
      );
      sqlChunks[1].push(
        sql`when ${schema.coins.name} = ${coin.name} then ${coin.market_cap}`,
      );
      sqlChunks[2].push(
        sql`when ${schema.coins.name} = ${coin.name} then ${coin.ath}`,
      );
      names.push(coin.name);
    }
    sqlChunks[0].push(sql`end)`);
    sqlChunks[1].push(sql`end)`);
    sqlChunks[2].push(sql`end)`);

    const finalSql1: SQL = sql.join(sqlChunks[0], sql.raw(" "));
    const finalSql2: SQL = sql.join(sqlChunks[1], sql.raw(" "));
    const finalSql3: SQL = sql.join(sqlChunks[2], sql.raw(" "));

    await this.db
      .update(schema.coins)
      .set({ price: finalSql1, market_cap: finalSql2, ath: finalSql3 })
      .where(inArray(schema.coins.name, names));
  }
}
