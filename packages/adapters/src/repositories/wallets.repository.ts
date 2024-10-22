import type {
  BlockchainsName,
  CoinedTransaction,
  CoinedWallet,
  SavedWallet,
  Transaction,
  Transfer,
  Wallet,
  WalletCoin,
  WalletsRepository,
} from "@repo/domain";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export class WalletsPostgres implements WalletsRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(connection_string: string) {
    const queryClient = postgres(connection_string, {
      max: 15,
      idle_timeout: 30_000,
      connect_timeout: 2_000,
    });
    this.db = drizzle(queryClient, { schema });
  }

  async saveWallet(coined_wallet: CoinedWallet): Promise<SavedWallet> {
    const saved_wallet = await this.db.transaction(async (tx) => {
      const [saved_wallet] = await tx
        .insert(schema.wallets)
        .values({
          ...coined_wallet,
          address: coined_wallet.address.toLowerCase(),
          native_value: coined_wallet.native_value,
          last_update: new Date(),
        })
        .returning();

      const wallet_coins = coined_wallet.coins.filter((c) => !c.token_id);

      if (wallet_coins.length > 0) {
        await tx.insert(schema.walletCoins).values(
          wallet_coins.map((c) => ({
            coin_id: c.coin.id,
            wallet_id: saved_wallet!.id,
            value: c.value,
          })),
        );
      }

      const wallet_nfts = coined_wallet.coins.filter((c) => c.token_id);

      if (wallet_nfts.length > 0) {
        await tx.insert(schema.walletNFTs).values(
          wallet_nfts.map((c) => ({
            nft_id: c.coin.id,
            wallet_id: saved_wallet!.id,
          })),
        );
      }

      return saved_wallet!;
    });

    return {
      ...saved_wallet,
      native_value: BigInt(saved_wallet.native_value),
      coins: coined_wallet.coins,
    };
  }

  async updateWallet(wallet_id: number, new_data: CoinedWallet): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Actualizo el native value
      await tx
        .update(schema.wallets)
        .set({
          native_value: new_data.native_value,
        })
        .where(eq(schema.wallets.id, wallet_id));

      // NFTs:
      const wallet_nfts = new_data.coins.filter((c) => c.token_id);

      if (wallet_nfts.length > 0) {
        // Guardo y si ya existe ignoro
        await tx
          .insert(schema.walletNFTs)
          .values(
            wallet_nfts.map((c) => ({
              nft_id: c.coin.id,
              wallet_id,
            })),
          )
          .onConflictDoNothing();

        // Elimino las que esten guardadas pero ya no estan en la wallet
        await tx.delete(schema.walletNFTs).where(
          and(
            eq(schema.walletNFTs.wallet_id, wallet_id),
            notInArray(
              schema.walletNFTs.nft_id,
              wallet_nfts.map((wn) => wn.coin.id),
            ),
          ),
        );
      }

      const wallet_coins = new_data.coins.filter((c) => !c.token_id);

      // Guardo y si ya existe actualizo el value
      for (const wallet_coin of wallet_coins) {
        await tx
          .insert(schema.walletCoins)
          .values({
            coin_id: wallet_coin.coin.id,
            wallet_id,
            value: wallet_coin.value,
          })
          .onConflictDoUpdate({
            target: [schema.walletCoins.coin_id, schema.walletCoins.wallet_id],
            set: {
              value: wallet_coin.value,
            },
          });
      }

      // Elimino las que esten guardadas pero ya no estan en la wallet
      await tx.delete(schema.walletCoins).where(
        and(
          eq(schema.walletCoins.wallet_id, wallet_id),
          notInArray(
            schema.walletCoins.coin_id,
            wallet_coins.map((wc) => wc.coin.id),
          ),
        ),
      );

      // Actualizo la fecha de actualización
      await tx
        .update(schema.wallets)
        .set({
          last_update: new Date(),
        })
        .where(eq(schema.wallets.id, wallet_id));
    });
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedWallet | undefined> {
    const saved_wallet = await this.db.query.wallets.findFirst({
      where: (wallets, { eq, and }) =>
        and(
          eq(wallets.address, address.toLowerCase()),
          eq(wallets.blockchain, blockchain),
        ),
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
        walletNFTs: {
          with: {
            nft: true,
          },
        },
      },
    });

    if (!saved_wallet) return undefined;

    const wallet_coins: WalletCoin[] = saved_wallet.walletCoins.map((wc) => ({
      coin_address: wc.coin.contracts.find((c) => c.blockchain === blockchain)!
        .contract_address,
      value: BigInt(wc.value),
    }));

    const wallet_nfts: WalletCoin[] = saved_wallet.walletNFTs.map((wn) => ({
      coin_address: wn.nft.contract_address,
      token_id: wn.nft.token_id,
      value: 0n,
    }));

    return {
      id: saved_wallet.id,
      address: saved_wallet.address,
      alias: saved_wallet.alias,
      backfill_status: saved_wallet.backfill_status,
      last_update: saved_wallet.last_update,
      blockchain: saved_wallet.blockchain,
      first_transfer_date: saved_wallet.first_transfer_date,
      native_value: BigInt(saved_wallet.native_value),
      coins: [...wallet_coins, ...wallet_nfts],
    };
  }

  async getWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
    ids?: number[],
  ): Promise<SavedWallet[]> {
    const page_size = 20;
    const saved_wallets = await this.db.query.wallets.findMany({
      where: (wallets, { eq, and, inArray }) =>
        and(
          eq(wallets.blockchain, blockchain),
          ids ? inArray(wallets.id, ids) : undefined,
        ),
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
        walletNFTs: {
          with: {
            nft: true,
          },
        },
      },
      limit: page_size,
      offset: (wallets_page - 1) * page_size,
    });

    const mapped_wallets: SavedWallet[] = saved_wallets.map((saved_wallet) => {
      const wallet_coins: WalletCoin[] = saved_wallet.walletCoins.map((wc) => ({
        coin_address: wc.coin.contracts.find(
          (c) => c.blockchain === blockchain,
        )!.contract_address,
        value: BigInt(wc.value),
      }));

      const wallet_nfts: WalletCoin[] = saved_wallet.walletNFTs.map((wn) => ({
        coin_address: wn.nft.contract_address,
        token_id: wn.nft.token_id,
        value: 0n,
      }));

      return {
        id: saved_wallet.id,
        address: saved_wallet.address,
        alias: saved_wallet.alias,
        backfill_status: saved_wallet.backfill_status,
        blockchain: saved_wallet.blockchain,
        first_transfer_date: saved_wallet.first_transfer_date,
        last_update: saved_wallet.last_update,
        native_value: BigInt(saved_wallet.native_value),
        coins: [...wallet_coins, ...wallet_nfts],
      };
    });

    return mapped_wallets;
  }

  async saveTransactions(
    transactions: CoinedTransaction[],
    blockchain: BlockchainsName,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Busco los hashes ya existentes
      const existing_hashes = await tx
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.blockchain, blockchain),
            inArray(
              schema.transactions.hash,
              transactions.map((t) => t.hash),
            ),
          ),
        );

      for (const transaction of transactions) {
        // Si ya existe en el repositorio, no lo inserto
        if (
          existing_hashes.find(
            (eh) =>
              eh.hash === transaction.hash &&
              eh.blockchain === transaction.blockchain,
          )
        )
          return;

        const [id] = await tx
          .insert(schema.transactions)
          .values({
            ...transaction,
            hash: transaction.hash.toLowerCase(),
            from_address: transaction.from_address?.toLowerCase(),
            to_address: transaction.to_address?.toLowerCase(),
            fee: transaction.fee,
          })
          .onConflictDoNothing()
          .returning({ id: schema.transactions.id });

        // Si hubo conflicto porque ya existe, no hacer nada
        if (!id) return;

        await tx.insert(schema.transfers).values(
          transaction.transfers.map((tr) => ({
            transaction_id: id.id,
            blockchain: transaction.blockchain,
            block_timestamp: transaction.block_timestamp,
            from_address: tr.from_address?.toLowerCase(),
            to_address: tr.to_address?.toLowerCase(),
            type: tr.type,
            value: tr.value,
            coin_id: tr.type !== "nft" ? tr.coin.id : null,
            nft_id: tr.type === "nft" ? tr.coin.id : null,
          })),
        );
      }
    });
  }

  async saveTransactionAndUpdateWallet(
    transaction_data: CoinedTransaction,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Busco los hashes ya existentes
      const existing_transaction = await tx
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.hash, transaction_data.hash),
            eq(schema.transactions.blockchain, transaction_data.blockchain),
          ),
        );

      if (existing_transaction.length > 0) return;

      const updated_wallet_ids: number[] = [];
      // Aparte de guardar la [Transaction],
      // tengo que cambiar el estado de la o las [Wallet]s relacionadas en cada [Transfer] hecha
      const [transaction_id] = await tx
        .insert(schema.transactions)
        .values({
          ...transaction_data,
          hash: transaction_data.hash.toLowerCase(),
          from_address: transaction_data.from_address?.toLowerCase(),
          to_address: transaction_data.to_address?.toLowerCase(),
          fee: transaction_data.fee,
        })
        .onConflictDoNothing()
        .returning({ id: schema.transactions.id });

      // Si ya existe, por lo que hubo conflicto, no hago nada
      if (!transaction_id) {
        console.warn(`La transacción: ${transaction_data} ya existe`);
        return;
      }

      // Si es from_wallet, le tengo que restar el fee
      if (transaction_data.from_address && transaction_data.fee !== 0n) {
        const [wallet] = await tx
          .update(schema.wallets)
          .set({
            native_value: sql`${schema.wallets.native_value} - ${Number(transaction_data.fee)}`,
          })
          .where(
            and(
              eq(schema.wallets.address, transaction_data.from_address),
              eq(schema.wallets.blockchain, transaction_data.blockchain),
            ),
          )
          .returning({ id: schema.wallets.id });

        if (wallet) {
          updated_wallet_ids.push(wallet.id);
        }
      }

      for (const transfer of transaction_data.transfers) {
        // Inserto la [Transfer]
        await tx.insert(schema.transfers).values({
          ...transfer,
          from_address: transfer.from_address?.toLowerCase(),
          to_address: transfer.to_address?.toLowerCase(),
          blockchain: transaction_data.blockchain,
          block_timestamp: transaction_data.block_timestamp,
          transaction_id: transaction_id.id,
          coin_id: transfer.coin.id,
          value: transfer.value,
        });

        // En este caso tengo que restarle el value de la transaction
        // Asumo que la las nfts y las coins ya existen en esa [Wallet], sino no podrían salir de ella
        if (transfer.from_address) {
          // Busco [Wallet] del from y el to:
          const [from_wallet] = await tx
            .select({ id: schema.wallets.id })
            .from(schema.wallets)
            .where(
              and(
                eq(schema.wallets.address, transfer.from_address),
                eq(schema.wallets.blockchain, transaction_data.blockchain),
              ),
            );

          if (from_wallet) {
            // Si es nativa, cambio directamente el valor de la tabla wallets
            if (transfer.type === "native") {
              await tx
                .update(schema.wallets)
                .set({
                  native_value: sql`${schema.wallets.native_value} - ${Number(transfer.value)}`,
                })
                .where(eq(schema.wallets.id, from_wallet.id));
            } else if (transfer.type === "token") {
              // Cambio en la tabla walletCoins
              await tx
                .update(schema.walletCoins)
                .set({
                  value: sql`${schema.walletCoins.value} - ${Number(transfer.value)}`,
                })
                .where(
                  and(
                    eq(schema.walletCoins.coin_id, transfer.coin.id),
                    eq(schema.walletCoins.wallet_id, from_wallet.id),
                  ),
                );
            } else if (transfer.type === "nft") {
              // Cambio en la tabla walletNFTs, solo puede haber o no haber NFT, en el 'from' lo elimino
              await tx
                .delete(schema.walletNFTs)
                .where(
                  and(
                    eq(schema.walletNFTs.nft_id, transfer.coin.id),
                    eq(schema.walletNFTs.wallet_id, from_wallet.id),
                  ),
                );
            }

            updated_wallet_ids.push(from_wallet.id);
          }
        }

        // En este caso tengo que sumarle
        if (transfer.to_address) {
          const [to_wallet] = await tx
            .select({ id: schema.wallets.id })
            .from(schema.wallets)
            .where(
              and(
                eq(schema.wallets.address, transfer.to_address),
                eq(schema.wallets.blockchain, transaction_data.blockchain),
              ),
            );

          if (to_wallet) {
            // Si es nativa, cambio directamente el valor de la tabla wallets
            if (transfer.type === "native") {
              await tx
                .update(schema.wallets)
                .set({
                  native_value: sql`${schema.wallets.native_value} + ${Number(transfer.value)}`,
                })
                .where(eq(schema.wallets.id, to_wallet.id));
            } else if (transfer.type === "token") {
              // Añado la [Coin] en esa [Wallet] con el value de la [Transfer]
              // En caso de ya existir, le sumo el balance
              await tx
                .insert(schema.walletCoins)
                .values({
                  coin_id: transfer.coin.id,
                  wallet_id: to_wallet.id,
                  value: transfer.value,
                })
                .onConflictDoUpdate({
                  target: [
                    schema.walletCoins.coin_id,
                    schema.walletCoins.wallet_id,
                  ],
                  set: {
                    value: sql`${schema.walletCoins.value} + ${Number(transfer.value)}`,
                  },
                });
            } else if (transfer.type === "nft") {
              // Cambio en la tabla walletNFTs, solo puede haber o no haber NFT, en el 'to' la inserto
              await tx
                .insert(schema.walletNFTs)
                .values({ nft_id: transfer.coin.id, wallet_id: to_wallet.id });
            }

            updated_wallet_ids.push(to_wallet.id);
          }
        }
      }

      // Actualizo la fecha de cambio de todas las wallets actualizadas
      if (updated_wallet_ids.length > 0) {
        await tx
          .update(schema.wallets)
          .set({
            last_update: new Date(),
          })
          .where(inArray(schema.wallets.id, updated_wallet_ids));
      }
    });
  }

  async getTransactions(
    wallet_address: string,
    blockchain: BlockchainsName,
    transactions_page: number,
    from_date: Date | undefined,
    to_date: Date | undefined,
  ): Promise<Transaction[]> {
    if (transactions_page < 0) return [];
    const page_size = transactions_page === 0 ? 1_000_000 : 10;
    // Busco las transfers en donde esté la Wallet involucrada
    const transfers_query = this.db
      .selectDistinct({
        transactionId: schema.transfers.transaction_id,
        block_timestamp: schema.transfers.block_timestamp,
      })
      .from(schema.transfers)
      .where(
        and(
          eq(schema.transfers.blockchain, sql.placeholder("blockchain")),
          or(
            eq(schema.transfers.from_address, sql.placeholder("walletAddress")),
            eq(schema.transfers.to_address, sql.placeholder("walletAddress")),
          ),
          from_date
            ? gte(schema.transfers.block_timestamp, from_date)
            : undefined,
          to_date ? lt(schema.transfers.block_timestamp, to_date) : undefined,
        ),
      )
      .orderBy(desc(schema.transfers.block_timestamp))
      .offset(sql.placeholder("queryOffset"))
      .limit(sql.placeholder("queryLimit"))
      .prepare("transfers_query");

    const transaction_ids = await transfers_query.execute({
      queryOffset:
        transactions_page === 0 ? 0 : (transactions_page - 1) * page_size,
      queryLimit: page_size,
      walletAddress: wallet_address.toLowerCase(),
      blockchain,
    });

    const transactions_query = this.db
      .select()
      .from(schema.transactions)
      .leftJoin(
        schema.transfers,
        eq(schema.transfers.transaction_id, schema.transactions.id),
      )
      .leftJoin(schema.coins, eq(schema.coins.id, schema.transfers.coin_id))
      .leftJoin(schema.nfts, eq(schema.nfts.id, schema.transfers.nft_id))
      .leftJoin(
        schema.contracts,
        and(
          eq(schema.contracts.coin_id, schema.transfers.coin_id),
          eq(schema.contracts.blockchain, schema.transactions.blockchain),
        ),
      )
      .where(
        and(
          eq(schema.transactions.blockchain, sql.placeholder("blockchain")),
          or(
            eq(
              schema.transactions.from_address,
              sql.placeholder("walletAddress"),
            ),
            eq(
              schema.transactions.to_address,
              sql.placeholder("walletAddress"),
            ),
            inArray(
              schema.transactions.id,
              transaction_ids.map((a) => a.transactionId),
            ),
          ),
        ),
      )
      .orderBy(desc(schema.transactions.block_timestamp))
      .offset(sql.placeholder("queryOffset"))
      .limit(sql.placeholder("queryLimit"))
      .prepare("transactions_query");

    // Me aseguro tener 20 transacciones, por mas que el array tenga mas porque haya mas de 20 transfers
    const transactions_data = await transactions_query.execute({
      queryOffset:
        transactions_page === 0 ? 0 : (transactions_page - 1) * page_size,
      queryLimit: page_size,
      walletAddress: wallet_address.toLowerCase(),
      blockchain,
    });

    const mapped_transactions = transactions_data.reduce((acc, transaction) => {
      // Uso el hash ya que la entidad Transaction no tiene id
      const existing_transaction = acc.find(
        (tx) => tx.hash === transaction.transactions.hash,
      );

      const is_nft = typeof transaction.nfts?.token_id === "number";

      const transfer_to_add: Transfer = {
        ...transaction.transfers!,
        token_id: is_nft ? transaction.nfts?.token_id! : null,
        value: BigInt(transaction.transfers!.value),
        coin_address: is_nft
          ? transaction.nfts?.contract_address!
          : (transaction.contracts?.contract_address ?? null),
      };

      if (!existing_transaction) {
        const new_transaction: Transaction = {
          ...transaction.transactions,
          fee: BigInt(transaction.transactions.fee),
          transfers: [transfer_to_add],
        };
        acc.push(new_transaction);
      } else {
        existing_transaction.transfers.push(transfer_to_add);
      }

      return acc;
    }, [] as Transaction[]);

    return mapped_transactions;
  }

  async updateWalletBackfillStatus(
    address: string,
    blockchain: BlockchainsName,
    new_status: "complete" | "active" | "pending",
    first_date?: Date,
  ): Promise<void> {
    await this.db
      .update(schema.wallets)
      .set({
        backfill_status: new_status,
        first_transfer_date: first_date,
      })
      .where(
        and(
          eq(schema.wallets.address, address.toLowerCase()),
          eq(schema.wallets.blockchain, blockchain),
        ),
      );
  }

  async getPendingWallets(): Promise<SavedWallet[]> {
    const pending_wallets = await this.db.query.wallets.findMany({
      where: (wallets, { eq }) => eq(wallets.backfill_status, "pending"),
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
        walletNFTs: {
          with: {
            nft: true,
          },
        },
      },
    });

    const saved_wallets: SavedWallet[] = [];
    for (const saved_wallet of pending_wallets) {
      const wallet_coins: WalletCoin[] = saved_wallet.walletCoins.map((wc) => ({
        coin_address: wc.coin.contracts.find(
          (c) => c.blockchain === saved_wallet.blockchain,
        )!.contract_address,
        value: BigInt(wc.value),
      }));

      const wallet_nfts: WalletCoin[] = saved_wallet.walletNFTs.map((wn) => ({
        coin_address: wn.nft.contract_address,
        token_id: wn.nft.token_id,
        value: 0n,
      }));

      saved_wallets.push({
        id: saved_wallet.id,
        address: saved_wallet.address,
        alias: saved_wallet.alias,
        backfill_status: saved_wallet.backfill_status,
        last_update: saved_wallet.last_update,
        blockchain: saved_wallet.blockchain,
        first_transfer_date: saved_wallet.first_transfer_date,
        native_value: BigInt(saved_wallet.native_value),
        coins: [...wallet_coins, ...wallet_nfts],
      });
    }

    return saved_wallets;
  }

  async getLatestTransactionDate(
    wallet_data: Wallet,
    order: "DESC" | "ASC",
  ): Promise<Date | null> {
    const latest_transaction = await this.db
      .select()
      .from(schema.transactions)
      .leftJoin(
        schema.transfers,
        eq(schema.transfers.transaction_id, schema.transactions.id),
      )
      .where(
        and(
          eq(schema.transactions.blockchain, wallet_data.blockchain),
          or(
            eq(schema.transactions.from_address, wallet_data.address),
            eq(schema.transactions.to_address, wallet_data.address),
            eq(schema.transfers.from_address, wallet_data.address),
            eq(schema.transfers.to_address, wallet_data.address),
          ),
        ),
      )
      .orderBy(
        order === "DESC"
          ? desc(schema.transactions.block_timestamp)
          : asc(schema.transactions.block_timestamp),
      )
      .limit(1);

    if (latest_transaction.length === 0) return null;

    return latest_transaction[0]!.transactions.block_timestamp;
  }
}
