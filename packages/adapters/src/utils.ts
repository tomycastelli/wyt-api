import { type Column, type SQLWrapper, sql } from "drizzle-orm";

export const eqLower = (column: Column, string: string | SQLWrapper) =>
  sql`LOWER(${column}) = LOWER(${string})`;
