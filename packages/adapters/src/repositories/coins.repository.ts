import {
  type BlockchainsName,
  type Candle,
  type Coin,
  type CoinMarketData,
  type CoinsRepository,
  type SavedCoin,
  type SavedNFT,
  blockchains,
} from "@repo/domain";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export class CoinsPostgres implements CoinsRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(connection_string: string) {
    const queryClient = postgres(connection_string, {
      max: 5,
      idle_timeout: 30_000,
      connect_timeout: 2_000,
    });
    this.db = drizzle(queryClient, { schema });
  }

  async saveCoins(coins: Coin[]): Promise<SavedCoin[]> {
    if (coins.length === 0) return [];
    const response = await this.db.transaction(async (tx) => {
      // Actualizo los datos asociados a la coin si ya existe su nombre
      const savedCoins = await tx
        .insert(schema.coins)
        .values(
          coins.map((c) => ({
            ...c,
            symbol: c.symbol.toLowerCase(),
            last_update: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: [schema.coins.name],
          set: {
            price: sql.raw(`excluded.${schema.coins.price.name}`),
            ath: sql.raw(`excluded.${schema.coins.ath.name}`),
            market_cap: sql.raw(`excluded.${schema.coins.market_cap.name}`),
            description: sql.raw(`excluded.${schema.coins.description.name}`),
            image_url: sql.raw(`excluded.${schema.coins.image_url.name}`),
            price_change_percentage_24h: sql.raw(
              `excluded.${schema.coins.price_change_percentage_24h.name}`,
            ),
            price_change_24h: sql.raw(
              `excluded.${schema.coins.price_change_24h.name}`,
            ),
            total_volume: sql.raw(`excluded.${schema.coins.total_volume.name}`),
            symbol: sql.raw(`excluded.${schema.coins.symbol.name}`),
            provider: sql.raw(`excluded.${schema.coins.provider.name}`),
            last_update: new Date(),
          },
        })
        .returning();

      const flattenedContracts = coins.flatMap((c) =>
        c.contracts
          ? c.contracts.map((contract) => ({
              ...contract,
              contract_address: contract.contract_address.toLowerCase(),
              coin_id: savedCoins.find((sv) => sv.name === c.name)!.id,
            }))
          : [],
      );

      const mappedCoins: SavedCoin[] = savedCoins.map((c) => ({
        ...c,
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
              contract_address: sql.raw(
                `excluded.${schema.contracts.contract_address.name}`,
              ),
              decimal_place: sql.raw(
                `excluded.${schema.contracts.decimal_place.name}`,
              ),
            },
          })
          .returning();

        for (const sc of savedContracts) {
          mappedCoins.find((c) => c.id === sc.coin_id)?.contracts.push(sc);
        }
      }

      return mappedCoins;
    });

    return response;
  }

  async getAllCoins(
    minimum_market_cap: number,
    maximum_market_cap?: number,
  ): Promise<SavedCoin[]> {
    const coinsData = await this.db.query.coins.findMany({
      where: (coins, { gte, lt, and }) =>
        and(
          gte(coins.market_cap, minimum_market_cap),
          maximum_market_cap
            ? lt(coins.market_cap, maximum_market_cap)
            : undefined,
        ),
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

    return coin;
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

  async getCoinByAddress(
    coin_address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedCoin | undefined> {
    const sq = this.db
      .select({ id: schema.coins.id })
      .from(schema.coins)
      .leftJoin(schema.contracts, eq(schema.contracts.coin_id, schema.coins.id))
      .where(
        and(
          eq(schema.contracts.contract_address, coin_address.toLowerCase()),
          eq(schema.contracts.blockchain, blockchain),
        ),
      )
      .limit(1)
      .as("sq");

    const coin_with_contracts = await this.db
      .select()
      .from(schema.coins)
      .leftJoin(sq, eq(schema.coins.id, sq.id))
      .leftJoin(schema.contracts, eq(schema.contracts.coin_id, schema.coins.id))
      .where(eq(schema.coins.id, sq.id));

    if (coin_with_contracts.length === 0) return undefined;

    const coin = coin_with_contracts.reduce(
      (saved_coin, item) => {
        const { contracts } = item;

        if (contracts) {
          saved_coin.contracts.push(contracts);
        }

        return saved_coin;
      },
      { ...coin_with_contracts[0]!.coins, contracts: [] } as SavedCoin,
    );

    return coin;
  }

  async getNFTByAddress(
    contract_address: string,
    token_id: number,
    blockchain: BlockchainsName,
  ): Promise<SavedNFT> {
    return await this.db.transaction(async (tx) => {
      const [saved_nft] = await tx
        .select()
        .from(schema.nfts)
        .where(
          and(
            eq(schema.nfts.contract_address, contract_address.toLowerCase()),
            eq(schema.nfts.token_id, token_id),
            eq(schema.nfts.blockchain, blockchain),
          ),
        )
        .limit(1);

      if (saved_nft) return saved_nft;

      const [new_nft] = await tx
        .insert(schema.nfts)
        .values({
          contract_address: contract_address.toLowerCase(),
          blockchain,
          token_id,
        })
        .onConflictDoNothing()
        .returning();

      return new_nft;
    });
  }

  async saveCandles(candles: Candle[]): Promise<void> {
    if (candles.length === 0) return;
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

  async getCandlesByDateRange(
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
          lt(schema.candles.timestamp, to_date),
        ),
      );

    return candles;
  }

  async getCandlesByDateList(
    frequency: "hourly" | "daily",
    coin_id: number,
    timestamps: Date[],
  ): Promise<Candle[]> {
    const candles = await this.db
      .select()
      .from(schema.candles)
      .where(
        and(
          eq(schema.candles.frequency, frequency),
          eq(schema.candles.coin_id, coin_id),
          inArray(schema.candles.timestamp, timestamps),
        ),
      );

    return candles;
  }

  async getCoinsByBlockchain(
    blockchain: BlockchainsName,
    page_number: number,
    page_size: number,
    ids: number[] | undefined,
  ): Promise<SavedCoin[]> {
    const base_coin = blockchains[blockchain];
    const coinsData = await this.db
      .select()
      .from(schema.coins)
      .leftJoin(schema.contracts, eq(schema.coins.id, schema.contracts.coin_id))
      .where(
        and(
          or(
            eq(schema.contracts.blockchain, blockchain),
            base_coin ? eq(schema.coins.name, base_coin.coin) : undefined,
          ),
          ids ? inArray(schema.coins.id, ids) : undefined,
        ),
      )
      .orderBy(desc(schema.coins.market_cap))
      .offset((page_number - 1) * page_size)
      .limit(page_size);

    const mappedCoins = coinsData.reduce((acc, item) => {
      const coin = item.coins!;
      const acc_coin = acc.find((c) => c.id === coin.id);

      if (acc_coin) {
        if (item.contracts) {
          acc_coin.contracts.push({
            blockchain: item.contracts.blockchain,
            contract_address: item.contracts.contract_address,
            decimal_place: item.contracts.decimal_place,
          });
        }
      } else {
        acc.push({
          ...coin,
          contracts: item.contracts
            ? [
                {
                  blockchain: item.contracts.blockchain,
                  contract_address: item.contracts.contract_address,
                  decimal_place: item.contracts.decimal_place,
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
    await this.db.transaction(async (tx) => {
      for (const market_data of coin_market_data) {
        await tx
          .update(schema.coins)
          .set({
            ath: market_data.ath,
            display_name: market_data.display_name,
            market_cap: market_data.market_cap,
            price: market_data.price,
            price_change_24h: market_data.price_change_24h,
            price_change_percentage_24h:
              market_data.price_change_percentage_24h,
            last_update: new Date(),
          })
          .where(eq(schema.coins.name, market_data.name));
      }
    });
  }
}
