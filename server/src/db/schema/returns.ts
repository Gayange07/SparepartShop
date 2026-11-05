import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { parts } from "./parts.js";
import { suppliers } from "./suppliers.js";
import { customers } from "./customers.js";
import { grns } from "./grn.js";
import { sales } from "./sales.js";
import { users } from "./users.js";

export const returns = sqliteTable("returns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  returnNo: text("return_no").notNull().unique(),
  partyType: text("party_type", { enum: ["supplier", "customer"] }).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  customerId: integer("customer_id").references(() => customers.id),
  grnId: integer("grn_id").references(() => grns.id),
  saleId: integer("sale_id").references(() => sales.id),
  partId: integer("part_id").notNull().references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }).notNull(),
  qty: integer("qty").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull().default(""),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
});
