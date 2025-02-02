import { type SQL, relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { type BlockchainsName, blockchains, providers } from "@repo/domain";

function lower(email: AnyPgColumn): SQL {
  return sql`lower(${email})`;
}

const largeDecimalNumber = customType<{ data: number }>({
  dataType() {
    return "numeric(30, 6)";
  },
  fromDriver(value) {
    return Number(value);
  },
  toDriver(value) {
    const roundedValue = Number(
      Number(value.toString().slice(0, 30)).toFixed(6),
    );

    return roundedValue;
  },
});

const decimalNumber = customType<{ data: number }>({
  dataType() {
    return "numeric(32, 22)";
  },
  fromDriver(value) {
    return Number(value);
  },
  toDriver(value) {
    const roundedValue = Number(
      Number(value.toString().slice(0, 32)).toFixed(22),
    );

    return roundedValue;
  },
});

const smallDecimalNumber = customType<{ data: number }>({
  dataType() {
    return "numeric(14, 8)";
  },
  fromDriver(value) {
    return Number(value);
  },
  toDriver(value) {
    const roundedValue = Number(
      Number(value.toString().slice(0, 14)).toFixed(8),
    );

    return roundedValue;
  },
});

const blockchainValue = customType<{ data: bigint }>({
  dataType() {
    return "numeric(36, 0)";
  },
  fromDriver(value) {
    return BigInt(Number(value));
  },
  toDriver(value) {
    const valueStr = value.toString();

    if (valueStr.length > 36) {
      console.warn(
        "Value exceeds the precision limit of numeric(36, 0): ",
        valueStr,
      );
      const truncatedStr = valueStr.substring(0, 36);
      return truncatedStr;
    }

    return valueStr;
  },
});

export const blockchainsEnum = pgEnum(
  "blockchains",
  Object.keys(blockchains) as [string, ...string[]],
);

export const providersEnum = pgEnum(
  "providers",
  providers as [string, ...string[]],
);

export const frequencyEnum = pgEnum("frequency", ["daily", "hourly"]);

export const backfillStatusEnum = pgEnum("backfill_status", [
  "pending",
  "active",
  "complete",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "native",
  "token",
  "nft",
]);

export const coins = pgTable(
  "coins",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 70 }).notNull().unique(),
    display_name: varchar("display_name", { length: 70 }),
    symbol: varchar("symbol", { length: 50 }).notNull(),
    provider: providersEnum("provider").notNull(),
    description: text("description"),
    image_url: text("image_url"),
    market_cap: largeDecimalNumber("market_cap").notNull(),
    total_volume: largeDecimalNumber("total_volume"),
    price: decimalNumber("price").notNull(),
    ath: decimalNumber("ath").notNull(),
    price_change_percentage_24h: smallDecimalNumber(
      "price_change_percentage_24h",
    ).notNull(),
    price_change_24h: decimalNumber("price_change_24h").notNull(),
    last_update: timestamp("last_update", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
  },
  (table) => ({
    nameIdx: index("name_idx").on(table.name),
    marketCapIdx: index("market_cap_idx").on(table.market_cap),
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
    address: varchar("address", { length: 65 }).notNull(),
    blockchain: blockchainsEnum("blockchain")
      .notNull()
      .$type<BlockchainsName>()
      .notNull(),
    alias: varchar("alias", { length: 50 }),
    native_value: blockchainValue("native_value").notNull(),
    first_transfer_date: timestamp("first_transfer_date", {
      mode: "date",
      withTimezone: false,
    }),
    backfill_status: backfillStatusEnum("backfill_status").notNull(),
    last_update: timestamp("last_update", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
    transaction_frequency: real("transaction_frequency"),
  },
  (table) => {
    return {
      uniqueAddressBlockchain: uniqueIndex("unique_address_blockchain").on(
        lower(table.address),
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

export const walletsValuations = pgTable(
  "wallets_valuations",
  {
    wallet_id: integer("wallet_id")
      .references(() => wallets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
    value_usd: largeDecimalNumber("value_usd").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.wallet_id, table.timestamp],
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
    block_timestamp: timestamp("block_timestamp", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
    from_address: varchar("from_address", { length: 65 }),
    to_address: varchar("to_address", { length: 65 }),
    fee: blockchainValue("fee").notNull(),
    summary: text("summary"),
  },
  (table) => {
    return {
      uniqueHashBlockchain: uniqueIndex("unique_hash_blockchain").on(
        table.hash,
        table.blockchain,
      ),
      blockTimestampIdx: index("block_timestamp_idx").on(table.block_timestamp),
    };
  },
);

export const transfers = pgTable(
  "transfers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    transaction_id: integer("transaction_id")
      .references(() => transactions.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      })
      .notNull(),
    blockchain: blockchainsEnum("blockchain")
      .notNull()
      .$type<BlockchainsName>()
      .notNull(),
    block_timestamp: timestamp("block_timestamp", {
      mode: "date",
      withTimezone: false,
    }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    coin_id: integer("coin_id").references(() => coins.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    nft_id: integer("nft_id").references(() => nfts.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    from_address: varchar("from_address", { length: 65 }),
    to_address: varchar("to_address", { length: 65 }),
    value: blockchainValue("value").notNull(),
  },
  (table) => {
    return {
      fromAddressIdx: index("from_address_idx").on(table.from_address),
      toAddressIdx: index("to_address_idx").on(table.to_address),
    };
  },
);

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
