import { defineConfig } from "drizzle-kit";
import path from "path";
export default defineConfig({
    dialect: "postgresql",
    schema: path.resolve(__dirname, "./schema.ts"), // Use __dirname to ensure correct path
    out: path.resolve(__dirname, "./migrations"), // Similarly for migrations folder
    dbCredentials: {
        url: process.env.POSTGRES_URL ?? "",
    },
});
