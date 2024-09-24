DO $$ BEGIN
 CREATE TYPE "public"."backfillStatus" AS ENUM('pending', 'complete');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."blockchains_enum" AS ENUM('bitcoin', 'ethereum', 'solana', 'polygon-pos', 'binance-smart-chain', 'avalanche');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."frequency" AS ENUM('daily', 'hourly');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."providers_enum" AS ENUM('coingecko');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transactionType" AS ENUM('native', 'erc20', 'nft');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candles" (
	"coin_id" integer NOT NULL,
	"frequency" "frequency" NOT NULL,
	"timestamp" timestamp NOT NULL,
	"open" numeric(24, 18) NOT NULL,
	"high" numeric(24, 18) NOT NULL,
	"low" numeric(24, 18) NOT NULL,
	"close" numeric(24, 18) NOT NULL,
	CONSTRAINT "candles_coin_id_frequency_timestamp_pk" PRIMARY KEY("coin_id","frequency","timestamp")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coins" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(50) NOT NULL,
	"symbol" varchar(50) NOT NULL,
	"provider" "providers_enum" NOT NULL,
	"description" text,
	"image_url" varchar(256),
	"market_cap" numeric(22, 6) NOT NULL,
	"price" numeric(24, 18) NOT NULL,
	"ath" numeric(24, 18) NOT NULL,
	"price_change_percentage_24h" numeric(9, 6) NOT NULL,
	"price_change_24h" numeric(24, 18) NOT NULL,
	CONSTRAINT "coins_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coins_names" (
	"coin_id" integer NOT NULL,
	"provider" "providers_enum" NOT NULL,
	"provider_coin_name" varchar NOT NULL,
	CONSTRAINT "coins_names_coin_id_provider_pk" PRIMARY KEY("coin_id","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"coin_id" integer NOT NULL,
	"blockchain" "blockchains_enum" NOT NULL,
	"contract_address" varchar NOT NULL,
	"decimal_place" integer NOT NULL,
	CONSTRAINT "contracts_coin_id_blockchain_pk" PRIMARY KEY("coin_id","blockchain")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nfts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nfts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(50) NOT NULL,
	"symbol" varchar(50) NOT NULL,
	"provider" "providers_enum" NOT NULL,
	"image_url" varchar(256) NOT NULL,
	"description" text,
	"token_id" integer NOT NULL,
	"price" numeric(24, 18) NOT NULL,
	"blockchain" "blockchains_enum" NOT NULL,
	"contract_address" varchar NOT NULL,
	CONSTRAINT "nfts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"hash" varchar(100) NOT NULL,
	"blockchain" "blockchains_enum" NOT NULL,
	"timestamp" timestamp NOT NULL,
	"type" "transactionType" NOT NULL,
	"coin_id" integer NOT NULL,
	"token_id" integer,
	"from_address" varchar(50) NOT NULL,
	"to_address" varchar(50) NOT NULL,
	"value" numeric(24, 0) NOT NULL,
	"fee" numeric(24, 0) NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_coins" (
	"wallet_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"value" numeric(24, 0) NOT NULL,
	CONSTRAINT "wallet_coins_wallet_id_coin_id_pk" PRIMARY KEY("wallet_id","coin_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(50) NOT NULL,
	"blockchain" "blockchains_enum" NOT NULL,
	"alias" varchar(50),
	"native_value" numeric(24, 0) NOT NULL,
	"timestamp" timestamp,
	"backfill_status" "backfillStatus" NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candles" ADD CONSTRAINT "candles_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coins_names" ADD CONSTRAINT "coins_names_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_coins" ADD CONSTRAINT "wallet_coins_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_coins" ADD CONSTRAINT "wallet_coins_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "name_search_index" ON "coins" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_address_blockchain" ON "wallets" USING btree ("address","blockchain");