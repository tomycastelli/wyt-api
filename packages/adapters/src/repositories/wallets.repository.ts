import {
  blockchains,
  BlockchainsName,
  Coin,
  CoinedWallet,
  Transaction,
  Wallet,
  WalletsRepository,
} from "@repo/domain";
import {
  drizzle,
  PostgresJsDatabase,
  PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import postgres from "postgres";
import { eq, and, ExtractTablesWithRelations, or, sql } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";

export class WalletsPostgres implements WalletsRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(connection_string: string) {
    const queryClient = postgres(connection_string);
    this.db = drizzle(queryClient, { schema });
  }

  async saveWallet(coined_wallet: CoinedWallet): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [saved_wallet] = await tx
        .insert(schema.wallets)
        .values({
          ...coined_wallet,
        })
        .returning();

      if (coined_wallet.coins.length > 0) {
        // Guardo las relaciones wallet-coins
        await tx.insert(schema.walletCoins).values(
          coined_wallet.coins.map((c) => ({
            coin_id: c.coin.id,
            wallet_id: saved_wallet!.id,
            value: c.value,
          })),
        );
      }
    });
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<CoinedWallet | undefined> {
    const wallet = await this.db.query.wallets.findFirst({
      where: (wallets, { eq, and }) =>
        and(eq(wallets.address, address), eq(wallets.blockchain, blockchain)),
      with: {
        walletCoins: {
          with: {
            coin: {
              with: {
                contracts: true,
              },
            },
          },
        },
      },
    });

    if (!wallet) return undefined;

    const native_coin = await this.db.query.coins.findFirst({
      where: (coins, { eq }) => eq(coins.name, blockchains[blockchain].coin),
      with: {
        contracts: true,
      },
    });

    const coined_wallet: CoinedWallet = {
      ...wallet,
      native_coin: native_coin!,
      coins: wallet.walletCoins.map((c) => ({
        coin: c.coin,
        coin_address: c.coin.contracts.find(
          (ct) => ct.blockchain === blockchain,
        )!.contract_address,
        value: c.value,
      })),
    };

    return coined_wallet;
  }

  async getWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
  ): Promise<CoinedWallet[]> {
    const page_size = 20;
    const wallets = await this.db.query.wallets.findMany({
      where: (wallets, { eq }) => eq(wallets.blockchain, blockchain),
      with: {
        walletCoins: {
          with: {
            coin: {
              with: {
                contracts: true,
              },
            },
          },
        },
      },
      limit: page_size,
      offset: (wallets_page - 1) * page_size,
    });

    const native_coin = await this.db.query.coins.findFirst({
      where: (coins, { eq }) => eq(coins.name, blockchains[blockchain].coin),
      with: {
        contracts: true,
      },
    });

    const coined_wallets: CoinedWallet[] = wallets.map((w) => ({
      ...w,
      native_coin: native_coin!,
      coins: w.walletCoins.map((c) => ({
        coin: c.coin,
        coin_address: c.coin.contracts.find(
          (ct) => ct.blockchain === blockchain,
        )!.contract_address,
        value: c.value,
      })),
    }));

    return coined_wallets;
  }

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    // Voy a buscar la coin_id segun la coin_address de cada transacción
    // Pidiendo un coin_id, la base de datos se asegura que ya existe esa [Coin] de la [Transaction]
    await this.db.transaction(async (tx) => {
      await Promise.all(
        transactions.map(async (transaction_data) => {
          const coin_id = await this.getCoinIdOfTransaction(
            transaction_data,
            tx,
          );
          // Inserto con la coin_id
          await tx
            .insert(schema.transactions)
            .values({ ...transaction_data, coin_id });
        }),
      );
    });
  }

  async saveTransactionAndUpdateWallet(
    transaction_data: Transaction,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const coin_id = await this.getCoinIdOfTransaction(transaction_data, tx);

      // Aparte de guardar la [Transaction], tengo que cambiar el estado de la o las [Wallet]s relacionadas
      await tx
        .insert(schema.transactions)
        .values({ ...transaction_data, coin_id });

      // Busco [Wallet] del from y el to
      const [from_wallet] = await tx
        .select({ id: schema.wallets.id })
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.address, transaction_data.from_address),
            eq(schema.wallets.blockchain, transaction_data.blockchain),
          ),
        );
      const [to_wallet] = await tx
        .select({ id: schema.wallets.id })
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.address, transaction_data.to_address),
            eq(schema.wallets.blockchain, transaction_data.blockchain),
          ),
        );

      // En este caso tengo que restarle el value de la transaction y la fee
      // Probablemente tenga que modelar mejor las transacciones para que puedan incluir mas de un movimiento :)
      if (from_wallet) {
        // Si es nativa, cambio directamente el valor de la tabla wallets
        if (transaction_data.type === "native") {
          await tx
            .update(schema.wallets)
            .set({
              native_value: sql`${schema.wallets.native_value} - ${transaction_data.value + transaction_data.fee}`,
            })
            .where(eq(schema.wallets.id, from_wallet.id));
        } else {
          // Cambio en la tabla walletCoins
          await tx
            .update(schema.walletCoins)
            .set({
              value: sql`${schema.walletCoins.value} - ${transaction_data.value}`,
            })
            .where(
              and(
                eq(schema.walletCoins.coin_id, coin_id),
                eq(schema.walletCoins.wallet_id, from_wallet.id),
              ),
            );
        }
      }

      // En este caso tengo que sumarle
      if (to_wallet) {
        // Si es nativa, cambio directamente el valor de la tabla wallets
        if (transaction_data.type === "native") {
          await tx
            .update(schema.wallets)
            .set({
              native_value: sql`${schema.wallets.native_value} - ${transaction_data.value}`,
            })
            .where(eq(schema.wallets.id, to_wallet.id));
        } else {
          // Cambio en la tabla walletCoins
          await tx
            .update(schema.walletCoins)
            .set({
              value: sql`${schema.walletCoins.value} - ${transaction_data.value}`,
            })
            .where(
              and(
                eq(schema.walletCoins.coin_id, coin_id),
                eq(schema.walletCoins.wallet_id, to_wallet.id),
              ),
            );
        }
      }
    });
  }

  async getTransactions(
    wallet_data: Wallet,
    transactions_page: number,
  ): Promise<Transaction[]> {
    const page_size = 20;
    const transactions = await this.db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.blockchain, wallet_data.blockchain),
          or(
            eq(schema.transactions.from_address, wallet_data.address),
            eq(schema.transactions.to_address, wallet_data.address),
          ),
        ),
      )
      .offset((transactions_page - 1) * page_size)
      .limit(page_size);

    return transactions;
  }

  async updateWalletBackfillStatus(
    wallet_data: Wallet,
    status: "complete" | "pending",
  ): Promise<void> {
    await this.db
      .update(schema.wallets)
      .set({ backfill_status: status })
      .where(
        and(
          eq(schema.wallets.address, wallet_data.address),
          eq(schema.wallets.blockchain, wallet_data.blockchain),
        ),
      );
  }

  // Helpers
  async getCoinIdOfTransaction(
    transaction_data: Transaction,
    tx: PgTransaction<
      PostgresJsQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >,
  ): Promise<number> {
    if (transaction_data.type === "native") {
      const [coin] = await tx
        .select({ id: schema.coins.id })
        .from(schema.coins)
        .where(
          and(
            eq(
              schema.coins.name,
              blockchains[transaction_data.blockchain].coin,
            ),
          ),
        )
        .limit(1);
      return coin!.id;
    } else {
      const [coin] = await tx
        .select({ id: schema.contracts.coin_id })
        .from(schema.contracts)
        .where(
          and(
            eq(schema.contracts.blockchain, transaction_data.blockchain),
            eq(
              schema.contracts.contract_address,
              transaction_data.coin_address!,
            ),
          ),
        )
        .limit(1);
      return coin!.id;
    }
  }
}
