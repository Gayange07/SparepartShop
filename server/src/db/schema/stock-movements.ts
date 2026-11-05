import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { parts } from "./parts.js";
import { users } from "./users.js";

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partId: integer("part_id").notNull().references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }).notNull(),
  qtyDelta: integer("qty_delta").notNull(),
  reason: text("reason", { enum: ["sale", "void", "grn", "return", "count", "adjustment"] }).notNull(),
  note: text("note").notNull().default(""),
  refType: text("ref_type"),
  refId: integer("ref_id"),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (t) => [index("stock_movements_part_id_idx").on(t.partId)]);
