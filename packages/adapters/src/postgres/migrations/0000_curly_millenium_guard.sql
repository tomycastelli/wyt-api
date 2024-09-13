DO $$ BEGIN
 CREATE TYPE "public"."blockchains_enum" AS ENUM('bitcoin', 'ethereum', 'solana', 'avalanche', 'polygon-pos', 'binance-smart-chain');
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
 CREATE TYPE "public"."providers_enum" AS ENUM('coin_gecko');
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
	"price" numeric(16, 6) NOT NULL,
	"ath" numeric(16, 6) NOT NULL,
	"price_change_24h" numeric(9, 6) NOT NULL,
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
	"address" varchar NOT NULL,
	CONSTRAINT "contracts_coin_id_blockchain_pk" PRIMARY KEY("coin_id","blockchain")
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
CREATE INDEX IF NOT EXISTS "name_search_index" ON "coins" USING gin (to_tsvector('english', "name"));