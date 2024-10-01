import {
  type BlockchainsName,
  type Candle,
  type Coin,
  type CoinMarketData,
  type CoinsRepository,
  NFT,
  type SavedCoin,
  type SavedNFT,
  blockchains,
} from "@repo/domain";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eqLower } from "../utils";
import * as schema from "./schema";

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
        .values(coins.map((c) => ({ ...c, last_update: new Date() })))
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

  async getCoinByAddress(
    coin_address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedCoin | undefined> {
    const [contract] = await this.db
      .select()
      .from(schema.contracts)
      .where(
        and(
          eqLower(schema.contracts.contract_address, coin_address),
          eq(schema.contracts.blockchain, blockchain),
        ),
      )
      .limit(1);

    if (!contract) return undefined;

    const coin = await this.db.query.coins.findFirst({
      where: (coins, { eq }) => eq(coins.id, contract.coin_id),
      with: {
        contracts: true,
      },
    });

    return coin!;
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
            eqLower(schema.nfts.contract_address, contract_address),
            eq(schema.nfts.token_id, token_id),
            eq(schema.nfts.blockchain, blockchain),
          ),
        )
        .limit(1);

      if (saved_nft) return saved_nft;

      const [new_nft] = await tx
        .insert(schema.nfts)
        .values({ contract_address, blockchain, token_id })
        .returning();

      return new_nft!;
    });
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
    blockchain: BlockchainsName,
    page_number: number,
    page_size: number,
  ): Promise<SavedCoin[]> {
    const base_coin = blockchains[blockchain];
    const coinsData = await this.db
      .select()
      .from(schema.coins)
      .leftJoin(schema.contracts, eq(schema.coins.id, schema.contracts.coin_id))
      .where(
        or(
          eq(schema.contracts.blockchain, blockchain),
          base_coin ? eq(schema.coins.name, base_coin.coin) : undefined,
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
        tx.update(schema.coins)
          .set({
            ...market_data,
            last_update: new Date(),
          })
          .where(eq(schema.coins.name, market_data.name));
      }
    });
  }
}
