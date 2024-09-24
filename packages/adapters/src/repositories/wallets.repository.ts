import {
  blockchains,
  BlockchainsName,
  Coin,
  CoinedTransaction,
  CoinedWallet,
  Transaction,
  Transfer,
  Wallet,
  WalletsRepository,
  SavedWallet,
  WalletCoin,
} from "@repo/domain";
import {
  drizzle,
  PostgresJsDatabase,
  PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import postgres from "postgres";
import {
  eq,
  and,
  ExtractTablesWithRelations,
  or,
  sql,
  inArray,
  desc,
} from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";

export class WalletsPostgres implements WalletsRepository {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(connection_string: string) {
    const queryClient = postgres(connection_string);
    this.db = drizzle(queryClient, { schema });
  }

  async saveWallet(coined_wallet: CoinedWallet): Promise<SavedWallet> {
    const saved_wallet = await this.db.transaction(async (tx) => {
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

      return saved_wallet!;
    });

    return { ...saved_wallet, coins: coined_wallet.coins };
  }

  async getWallet(
    address: string,
    blockchain: BlockchainsName,
  ): Promise<SavedWallet | undefined> {
    const saved_wallet = await this.db.query.wallets.findFirst({
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
      token_id: null,
      type: "coin",
      value: wc.value,
    }));

    const wallet_nfts: WalletCoin[] = saved_wallet.walletNFTs.map((wn) => ({
      coin_address: wn.nft.contract_address,
      token_id: wn.nft.token_id,
      type: "nft",
      value: 0n,
    }));

    return { ...saved_wallet, coins: [...wallet_coins, ...wallet_nfts] };
  }

  async getWalletsByBlockchain(
    blockchain: BlockchainsName,
    wallets_page: number,
  ): Promise<SavedWallet[]> {
    const page_size = 20;
    const saved_wallets = await this.db.query.wallets.findMany({
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
        token_id: null,
        type: "coin",
        value: wc.value,
      }));

      const wallet_nfts: WalletCoin[] = saved_wallet.walletNFTs.map((wn) => ({
        coin_address: wn.nft.contract_address,
        token_id: wn.nft.token_id,
        type: "nft",
        value: 0n,
      }));

      return { ...saved_wallet, coins: [...wallet_coins, ...wallet_nfts] };
    });

    return mapped_wallets;
  }

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Insertar todas las [Transaction]s y obtengo su ID
      const transactionIds = await tx
        .insert(schema.transactions)
        .values(transactions)
        .returning({ id: schema.transactions.id });

      // Preparo el array de [Transfer]s
      const transferInserts = [];
      for (let i = 0; i < transactions.length; i++) {
        const transaction_data = transactions[i]!;
        const transaction_id = transactionIds[i]!.id;

        for (const transfer_data of transaction_data.transfers) {
          const coin_id = await this.getCoinIdOfTransfer(
            transfer_data,
            transaction_data.blockchain,
            tx,
          );

          transferInserts.push({
            coin_id,
            transaction_id,
            ...transfer_data,
          });
        }
      }

      // Inserto todas las [Transfer]s en un sola operación
      await tx.insert(schema.transfers).values(transferInserts);
    });
  }

  async saveTransactionAndUpdateWallet(
    transaction_data: Transaction,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Aparte de guardar la [Transaction],
      // tengo que cambiar el estado de la o las [Wallet]s relacionadas en cada [Transfer] hecha
      const [transaction_id] = await tx
        .insert(schema.transactions)
        .values(transaction_data)
        .returning({ id: schema.transactions.id });

      await Promise.all(
        transaction_data.transfers.map(async (transfer) => {
          const coin_id = await this.getCoinIdOfTransfer(
            transfer,
            transaction_data.blockchain,
            tx,
          );

          // Inserto la [Transfer]
          await tx.insert(schema.transfers).values({
            transaction_id: transaction_id!.id,
            coin_id,
            ...transfer,
          });

          // Busco [Wallet] del from y el to
          const [from_wallet] = await tx
            .select({ id: schema.wallets.id })
            .from(schema.wallets)
            .where(
              and(
                eq(schema.wallets.address, transfer.from_address),
                eq(schema.wallets.blockchain, transaction_data.blockchain),
              ),
            );
          const [to_wallet] = await tx
            .select({ id: schema.wallets.id })
            .from(schema.wallets)
            .where(
              and(
                eq(schema.wallets.address, transfer.to_address),
                eq(schema.wallets.blockchain, transaction_data.blockchain),
              ),
            );

          // En este caso tengo que restarle el value de la transaction y la fee
          // Asumo que la las nfts y las coins ya existen en esa [Wallet], sino no podrían salir de ella
          if (from_wallet) {
            // Si es nativa, cambio directamente el valor de la tabla wallets
            if (transfer.type === "native") {
              await tx
                .update(schema.wallets)
                .set({
                  native_value: sql`${schema.wallets.native_value} - ${transfer.value + transaction_data.fee}`,
                })
                .where(eq(schema.wallets.id, from_wallet.id));
            } else if (transfer.type === "erc20") {
              // Cambio en la tabla walletCoins
              await tx
                .update(schema.walletCoins)
                .set({
                  value: sql`${schema.walletCoins.value} - ${transfer.value}`,
                })
                .where(
                  and(
                    eq(schema.walletCoins.coin_id, coin_id),
                    eq(schema.walletCoins.wallet_id, from_wallet.id),
                  ),
                );
            } else if (transfer.type === "nft") {
              // Cambio en la tabla walletNFTs, solo puede haber o no haber NFT, en el 'from' lo elimino
              await tx
                .delete(schema.walletNFTs)
                .where(
                  and(
                    eq(schema.walletNFTs.nft_id, coin_id),
                    eq(schema.walletNFTs.wallet_id, from_wallet.id),
                  ),
                );
            }
          }

          // En este caso tengo que sumarle
          if (to_wallet) {
            // Si es nativa, cambio directamente el valor de la tabla wallets
            if (transfer.type === "native") {
              await tx
                .update(schema.wallets)
                .set({
                  native_value: sql`${schema.wallets.native_value} - ${transfer.value}`,
                })
                .where(eq(schema.wallets.id, to_wallet.id));
            } else if (transfer.type === "erc20") {
              const where_coinditions = and(
                eq(schema.walletCoins.coin_id, coin_id),
                eq(schema.walletCoins.wallet_id, to_wallet.id),
              );
              // Puede haber [Coin]s nuevas en esa [Wallet]
              const [wallet_coin] = await tx
                .select()
                .from(schema.walletCoins)
                .where(where_coinditions)
                .limit(1);

              if (wallet_coin) {
                // Actualizo el valor en walletCoins
                await tx
                  .update(schema.walletCoins)
                  .set({
                    value: sql`${schema.walletCoins.value} - ${transfer.value}`,
                  })
                  .where(where_coinditions);
              } else {
                // Añado la [Coin] en esa [Wallet] con el value de la [Transfer]
                await tx.insert(schema.walletCoins).values({
                  coin_id: coin_id,
                  wallet_id: to_wallet.id,
                  value: transfer.value,
                });
              }
            } else if (transfer.type === "nft") {
              // Cambio en la tabla walletNFTs, solo puede haber o no haber NFT, en el 'to' la inserto
              await tx
                .insert(schema.walletNFTs)
                .values({ nft_id: coin_id, wallet_id: to_wallet.id });
            }
          }
        }),
      );
    });
  }

  async getTransactions(
    wallet_data: Wallet,
    transactions_page: number,
  ): Promise<Transaction[]> {
    const page_size = 20;
    // Busco las transfers en donde esté la Wallet involucrada
    const transfers_query = this.db
      .selectDistinct({ transactionId: schema.transfers.transaction_id })
      .from(schema.transfers)
      .where(
        or(
          eq(schema.transfers.from_address, wallet_data.address),
          eq(schema.transfers.to_address, wallet_data.address),
        ),
      )
      .orderBy(desc(schema.transfers.transaction_id))
      .offset(sql.placeholder("queryOffset"))
      .limit(sql.placeholder("queryLimit"));

    const transactions_query = this.db
      .select()
      .from(schema.transactions)
      .leftJoin(
        schema.transfers,
        eq(schema.transfers.transaction_id, schema.transactions.id),
      )
      .where(inArray(schema.transactions.id, transfers_query))
      .orderBy(desc(schema.transactions.id))
      .prepare("transactions_query");

    // Me aseguro tener 20 transacciones, por mas que el array tenga mas porque haya mas de 20 transfers
    const transactions_data = await transactions_query.execute({
      queryOffset: (transactions_page - 1) * page_size,
      queryLimit: page_size,
    });

    const mapped_transactions = transactions_data.reduce((acc, transaction) => {
      // Uso el hash ya que la entidad Transaction no tiene id
      const existing_transaction = acc.find(
        (tx) => tx.hash === transaction.transactions.hash,
      );

      if (!existing_transaction) {
        const new_transaction: Transaction = {
          ...transaction.transactions,
          transfers: [transaction.transfers!],
        };
        acc.push(new_transaction);
      } else {
        const new_transfer = transaction.transfers!;

        existing_transaction.transfers.push(new_transfer);
      }

      return acc;
    }, [] as Transaction[]);

    return mapped_transactions;
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
  async getCoinIdOfTransfer(
    transfer_data: Transfer,
    blockchain: BlockchainsName,
    tx: PgTransaction<
      PostgresJsQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >,
  ): Promise<number> {
    if (transfer_data.type === "native") {
      const [coin] = await tx
        .select({ id: schema.coins.id })
        .from(schema.coins)
        .where(and(eq(schema.coins.name, blockchains[blockchain].coin)))
        .limit(1);
      return coin!.id;
    } else if (transfer_data.type === "erc20") {
      const [coin] = await tx
        .select({ id: schema.contracts.coin_id })
        .from(schema.contracts)
        .where(
          and(
            eq(schema.contracts.blockchain, blockchain),
            eq(schema.contracts.contract_address, transfer_data.coin_address!),
          ),
        )
        .limit(1);
      return coin!.id;
    } else {
      // Es de tipo nft
      const [nft] = await tx
        .select({ id: schema.nfts.id })
        .from(schema.nfts)
        .where(
          and(
            eq(schema.nfts.blockchain, blockchain),
            eq(schema.nfts.contract_address, transfer_data.coin_address!),
            eq(schema.nfts.token_id, transfer_data.token_id!),
          ),
        )
        .limit(1);

      return nft!.id;
    }
  }
}
