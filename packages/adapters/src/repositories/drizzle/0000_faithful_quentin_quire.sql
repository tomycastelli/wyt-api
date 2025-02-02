DO $$ BEGIN
 CREATE TYPE "public"."backfill_status" AS ENUM('pending', 'active', 'complete');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."blockchains" AS ENUM('bitcoin', 'ethereum', 'solana', 'polygon-pos', 'binance-smart-chain', 'avalanche');
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
 CREATE TYPE "public"."providers" AS ENUM('coingecko');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transaction_type" AS ENUM('native', 'token', 'nft');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candles" (
	"coin_id" integer NOT NULL,
	"frequency" "frequency" NOT NULL,
	"timestamp" timestamp NOT NULL,
	"open" numeric(32, 22) NOT NULL,
	"high" numeric(32, 22) NOT NULL,
	"low" numeric(32, 22) NOT NULL,
	"close" numeric(32, 22) NOT NULL,
	CONSTRAINT "candles_coin_id_frequency_timestamp_pk" PRIMARY KEY("coin_id","frequency","timestamp")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coins" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(70) NOT NULL,
	"display_name" varchar(70),
	"symbol" varchar(50) NOT NULL,
	"provider" "providers" NOT NULL,
	"description" text,
	"image_url" text,
	"market_cap" numeric(24, 6) NOT NULL,
	"total_volume" numeric(24, 6),
	"price" numeric(32, 22) NOT NULL,
	"ath" numeric(32, 22) NOT NULL,
	"price_change_percentage_24h" numeric(14, 8) NOT NULL,
	"price_change_24h" numeric(32, 22) NOT NULL,
	"last_update" timestamp NOT NULL,
	CONSTRAINT "coins_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"coin_id" integer NOT NULL,
	"blockchain" "blockchains" NOT NULL,
	"contract_address" varchar NOT NULL,
	"decimal_place" integer NOT NULL,
	CONSTRAINT "contracts_coin_id_blockchain_pk" PRIMARY KEY("coin_id","blockchain")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nfts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nfts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"token_id" integer NOT NULL,
	"blockchain" "blockchains" NOT NULL,
	"contract_address" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"hash" varchar(100) NOT NULL,
	"blockchain" "blockchains" NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"from_address" varchar(65),
	"to_address" varchar(65),
	"fee" numeric(36, 0) NOT NULL,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transfers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" integer NOT NULL,
	"blockchain" "blockchains" NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"type" "transaction_type" NOT NULL,
	"coin_id" integer,
	"nft_id" integer,
	"from_address" varchar(65),
	"to_address" varchar(65),
	"value" numeric(36, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_coins" (
	"wallet_id" integer NOT NULL,
	"coin_id" integer NOT NULL,
	"value" numeric(36, 0) NOT NULL,
	CONSTRAINT "wallet_coins_wallet_id_coin_id_pk" PRIMARY KEY("wallet_id","coin_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_nfts" (
	"wallet_id" integer NOT NULL,
	"nft_id" integer NOT NULL,
	CONSTRAINT "wallet_nfts_wallet_id_nft_id_pk" PRIMARY KEY("wallet_id","nft_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(65) NOT NULL,
	"blockchain" "blockchains" NOT NULL,
	"alias" varchar(50),
	"native_value" numeric(36, 0) NOT NULL,
	"first_transfer_date" timestamp,
	"backfill_status" "backfill_status" NOT NULL,
	"last_update" timestamp NOT NULL,
	"transaction_frequency" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets_valuations" (
	"wallet_id" integer NOT NULL,
	"timestamp" timestamp NOT NULL,
	"value_usd" numeric(24, 6) NOT NULL,
	CONSTRAINT "wallets_valuations_wallet_id_timestamp_pk" PRIMARY KEY("wallet_id","timestamp")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candles" ADD CONSTRAINT "candles_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
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
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_nft_id_nfts_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nfts"("id") ON DELETE cascade ON UPDATE cascade;
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
DO $$ BEGIN
 ALTER TABLE "wallet_nfts" ADD CONSTRAINT "wallet_nfts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_nfts" ADD CONSTRAINT "wallet_nfts_nft_id_nfts_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nfts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets_valuations" ADD CONSTRAINT "wallets_valuations_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "name_idx" ON "coins" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_cap_idx" ON "coins" USING btree ("market_cap");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_address_blockchain_tokenid" ON "nfts" USING btree ("contract_address","blockchain","token_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_hash_blockchain" ON "transactions" USING btree ("hash","blockchain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_timestamp_idx" ON "transactions" USING btree ("block_timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "from_address_idx" ON "transfers" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "to_address_idx" ON "transfers" USING btree ("to_address");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_address_blockchain" ON "wallets" USING btree (lower("address"),"blockchain");