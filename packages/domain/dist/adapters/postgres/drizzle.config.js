import { defineConfig } from "drizzle-kit";
export default defineConfig({
    dialect: "postgresql",
    schema: "./src/adapters/postgres/schema.ts",
    out: "./src/adapters/postgres/migrations",
    dbCredentials: {
        url: process.env.POSTGRES_URL ?? "",
    },
});
