import { relations, sql } from "drizzle-orm";
import { customType, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, varchar, } from "drizzle-orm/pg-core";
import { blockchains, providers } from "../../core/vars";
const largeDecimalNumber = customType({
    dataType() {
        return "numeric(22, 6)";
    },
    fromDriver(value) {
        return Number(value);
    },
});
const decimalNumber = customType({
    dataType() {
        return "numeric(24, 18)";
    },
    fromDriver(value) {
        return Number(value);
    },
});
const mediumDecimalNumber = customType({
    dataType() {
        return "numeric(16, 6)";
    },
    fromDriver(value) {
        return Number(value);
    },
});
const smallDecimalNumber = customType({
    dataType() {
        return "numeric(9, 6)";
    },
    fromDriver(value) {
        return Number(value);
    },
});
export const blockchainsEnum = pgEnum("blockchains_enum", blockchains);
export const providersEnum = pgEnum("providers_enum", providers);
export const frequencyEnum = pgEnum("frequency", ["daily", "hourly"]);
export const coins = pgTable("coins", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    symbol: varchar("symbol", { length: 50 }).notNull(),
    provider: providersEnum("provider").notNull(),
    description: text("description"),
    image_url: varchar("image_url", { length: 256 }),
    market_cap: largeDecimalNumber("market_cap").notNull(),
    price: mediumDecimalNumber("price").notNull(),
    ath: mediumDecimalNumber("ath").notNull(),
    price_change_24h: smallDecimalNumber("price_change_24h").notNull(),
}, (table) => ({
    nameSearchIndex: index("name_search_index").using("gin", sql `to_tsvector('english', ${table.name})`),
}));
export const contracts = pgTable("contracts", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    coin_id: integer("coin_id")
        .references(() => coins.id, { onDelete: "cascade", onUpdate: "cascade" })
        .notNull(),
    blockchain: blockchainsEnum("blockchain").notNull(),
    address: varchar("address").notNull(),
});
export const coinsNames = pgTable("coins_names", {
    coin_id: integer("coin_id")
        .references(() => coins.id, { onDelete: "cascade", onUpdate: "cascade" })
        .notNull(),
    provider: providersEnum("provider").notNull(),
    provider_coin_name: varchar("provider_coin_name").notNull(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.coin_id, table.provider] }),
    };
});
export const candles = pgTable("candles", {
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
}, (table) => {
    return {
        pk: primaryKey({
            columns: [table.coin_id, table.frequency, table.timestamp],
        }),
    };
});
export const coinsRelations = relations(coins, ({ many }) => ({
    contracts: many(contracts),
}));
export const contractsRelations = relations(contracts, ({ one }) => ({
    coin: one(coins, {
        fields: [contracts.coin_id],
        references: [coins.id],
    }),
}));
