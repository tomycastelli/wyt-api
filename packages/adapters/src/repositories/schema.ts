import { relations, sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { blockchains, providers, BlockchainsName } from "@repo/domain";

const largeDecimalNumber = customType<{ data: number }>({
  dataType() {
    return "numeric(22, 6)";
  },
  fromDriver(value) {
    return Number(value);
  },
});

const decimalNumber = customType<{ data: number }>({
  dataType() {
    return "numeric(24, 18)";
  },
  fromDriver(value) {
    return Number(value);
  },
});

const smallDecimalNumber = customType<{ data: number }>({
  dataType() {
    return "numeric(9, 6)";
  },
  fromDriver(value) {
    return Number(value);
  },
});

const blockchainValue = customType<{ data: number }>({
  dataType() {
    return "numeric(24, 0)";
  },
  fromDriver(value) {
    return Number(value);
  },
});

export const blockchainsEnum = pgEnum(
  "blockchains_enum",
  Object.keys(blockchains) as [string, ...string[]],
);

export const providersEnum = pgEnum(
  "providers_enum",
  providers as [string, ...string[]],
);

export const frequencyEnum = pgEnum("frequency", ["daily", "hourly"]);

export const backfillStatusEnum = pgEnum("backfillStatus", [
  "pending",
  "complete",
]);

export const transactionTypeEnum = pgEnum("transactionType", [
  "native",
  "token",
  "nft",
]);

export const coins = pgTable(
  "coins",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    symbol: varchar("symbol", { length: 50 }).notNull(),
    provider: providersEnum("provider").notNull(),
    description: text("description"),
    image_url: varchar("image_url", { length: 256 }),
    market_cap: largeDecimalNumber("market_cap").notNull(),
    price: decimalNumber("price").notNull(),
    ath: decimalNumber("ath").notNull(),
    price_change_percentage_24h: smallDecimalNumber(
      "price_change_percentage_24h",
    ).notNull(),
    price_change_24h: decimalNumber("price_change_24h").notNull(),
  },
  (table) => ({
    nameSearchIndex: index("name_search_index").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
  }),
);

export const contracts = pgTable(
  "contracts",
  {
    coin_id: integer("coin_id")
      .references(() => coins.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    blockchain: blockchainsEnum("blockchain")
      .notNull()
      .$type<BlockchainsName>(),
    contract_address: varchar("contract_address").notNull(),
    decimal_place: integer("decimal_place").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.coin_id, table.blockchain] }),
    };
  },
);

export const coinsNames = pgTable(
  "coins_names",
  {
    coin_id: integer("coin_id")
      .references(() => coins.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    provider: providersEnum("provider").notNull(),
    provider_coin_name: varchar("provider_coin_name").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.coin_id, table.provider] }),
    };
  },
);

export const nfts = pgTable(
  "nfts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    token_id: integer("token_id").notNull(),
    blockchain: blockchainsEnum("blockchain")
      .notNull()
      .$type<BlockchainsName>(),
    contract_address: varchar("contract_address").notNull(),
  },
  (table) => {
    return {
      uniqueAddressBlockchainTokenId: uniqueIndex(
        "unique_address_blockchain_tokenid",
      ).on(table.contract_address, table.blockchain, table.token_id),
    };
  },
);

export const wallets = pgTable(
  "wallets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    address: varchar("address", { length: 50 }).notNull(),
    blockchain: blockchainsEnum("blockchain")
      .notNull()
      .$type<BlockchainsName>()
      .notNull(),
    alias: varchar("alias", { length: 50 }),
    native_value: blockchainValue("native_value").notNull(),
    first_transfer_date: timestamp("timestamp", {
      mode: "date",
      withTimezone: false,
    }),
    backfill_status: backfillStatusEnum("backfill_status").notNull(),
  },
  (table) => {
    return {
      uniqueAddressBlockchain: uniqueIndex("unique_address_blockchain").on(
        table.address,
        table.blockchain,
      ),
    };
  },
);

export const walletCoins = pgTable(
  "wallet_coins",
  {
    wallet_id: integer("wallet_id")
      .references(() => wallets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    coin_id: integer("coin_id")
      .references(() => coins.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    value: blockchainValue("value").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.wallet_id, table.coin_id],
      }),
    };
  },
);

export const walletNFTs = pgTable(
  "wallet_nfts",
  {
    wallet_id: integer("wallet_id")
      .references(() => wallets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    nft_id: integer("nft_id")
      .references(() => nfts.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.wallet_id, table.nft_id],
      }),
    };
  },
);

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    hash: varchar("hash", { length: 100 }).notNull(),
    blockchain: blockchainsEnum("blockchain")
      .notNull()
      .$type<BlockchainsName>()
      .notNull(),
    block_timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
    from_address: varchar("from_address", { length: 50 }).notNull(),
    to_address: varchar("to_address", { length: 50 }).notNull(),
    fee: blockchainValue("fee").notNull(),
    summary: text("summary").notNull(),
  },
  (table) => {
    return {
      uniqueHashBlockchain: uniqueIndex("unique_hash_blockchain").on(
        table.hash,
        table.blockchain,
      ),
    };
  },
);

export const transfers = pgTable("transfers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transaction_id: integer("transaction_id")
    .references(() => transactions.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .notNull(),
  type: transactionTypeEnum("type").notNull(),
  coin_id: integer("coin_id").references(() => coins.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  nft_id: integer("nft_id").references(() => nfts.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  from_address: varchar("from_address", { length: 50 }).notNull(),
  to_address: varchar("to_address", { length: 50 }).notNull(),
  value: blockchainValue("value").notNull(),
});

export const candles = pgTable(
  "candles",
  {
    coin_id: integer("coin_id")
      .references(() => coins.id, { onDelete: "cascade", onUpdate: "cascade" })
      .notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
    open: decimalNumber("open").notNull(),
    high: decimalNumber("high").notNull(),
    low: decimalNumber("low").notNull(),
    close: decimalNumber("close").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.coin_id, table.frequency, table.timestamp],
      }),
    };
  },
);

export const coinsRelations = relations(coins, ({ many }) => ({
  contracts: many(contracts),
  walletCoins: many(walletCoins),
}));

export const nftsRelations = relations(nfts, ({ one, many }) => ({
  // Relación one-to-one entre nfts y wallets
  walletNFT: one(walletNFTs),
  transfer: many(transfers),
}));

export const contractsRelations = relations(contracts, ({ one }) => ({
  coin: one(coins, {
    fields: [contracts.coin_id],
    references: [coins.id],
  }),
}));

export const walletRelations = relations(wallets, ({ many }) => ({
  walletCoins: many(walletCoins),
  walletNFTs: many(walletNFTs),
}));

export const walletCoinsRelations = relations(walletCoins, ({ one }) => ({
  coin: one(coins, {
    fields: [walletCoins.coin_id],
    references: [coins.id],
  }),
  wallet: one(wallets, {
    fields: [walletCoins.wallet_id],
    references: [wallets.id],
  }),
}));

export const walletNFTsRelations = relations(walletNFTs, ({ one }) => ({
  wallet: one(wallets, {
    fields: [walletNFTs.wallet_id],
    references: [wallets.id],
  }),
  nft: one(nfts, {
    fields: [walletNFTs.nft_id],
    references: [nfts.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ many }) => ({
  transfers: many(transfers),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transfers.transaction_id],
    references: [transactions.id],
  }),
}));
