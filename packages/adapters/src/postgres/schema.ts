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

export const blockchainsEnum = pgEnum(
  "blockchains_enum",
  Object.keys(blockchains) as [string, ...string[]],
);

export const providersEnum = pgEnum(
  "providers_enum",
  providers as [string, ...string[]],
);

export const frequencyEnum = pgEnum("frequency", ["daily", "hourly"]);

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

export const nfts = pgTable("nfts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  provider: providersEnum("provider").notNull(),
  image_url: varchar("image_url", { length: 256 }).notNull(),
  description: text("description"),
  token_id: integer("token_id").notNull(),
  price: decimalNumber("price").notNull(),
  blockchain: blockchainsEnum("blockchain").notNull().$type<BlockchainsName>(),
  contract_address: varchar("contract_address").notNull(),
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
}));

export const contractsRelations = relations(contracts, ({ one }) => ({
  coin: one(coins, {
    fields: [contracts.coin_id],
    references: [coins.id],
  }),
}));
