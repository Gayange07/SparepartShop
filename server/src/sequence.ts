import { sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db as defaultDb } from "./db/client.js";

type SelectCapable = { select: typeof defaultDb.select };

/**
 * Next padded sequence number for a table, scoped to rows matching `where` if given (e.g. one counter per payment type).
 * Pass the transaction's `tx` (not the module-level `db`) when called from inside `db.transaction(...)`, so the
 * count-then-insert is atomic under better-sqlite3's exclusive transaction lock — avoids a duplicate-number race
 * between two near-simultaneous requests.
 */
export function nextSeq(prefix: string, table: SQLiteTable, where?: ReturnType<typeof sql>, executor: SelectCapable = defaultDb): string {
  const query = executor.select({ count: sql<number>`count(*)` }).from(table);
  const [{ count }] = where ? query.where(where).all() : query.all();
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}
