import path from "node:path";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: path.resolve(__dirname, "./schema.ts"),
  out: path.resolve(__dirname, "./drizzle"),
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? "",
  },
});
