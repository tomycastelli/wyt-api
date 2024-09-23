import { CoinedWallet, Wallet, WalletsRepository } from "@repo/domain";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import postgres from "postgres";
import { eq } from "drizzle-orm";

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

      // Guardo las relaciones wallet-coins
      await tx
        .insert(schema.walletCoins)
        .values(
          coined_wallet.coins.map((c) => ({
            coin_id: c.coin.id,
            wallet_id: saved_wallet!.id,
            value: c.value,
          })),
        );
    });
  }
}
