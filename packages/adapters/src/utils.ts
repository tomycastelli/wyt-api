import { type Column, sql } from "drizzle-orm";

export const eqLower = (column: Column, string: string) =>
  sql`LOWER(${column}) = LOWER(${string})`;
