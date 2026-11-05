import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { suppliers } from "./suppliers.js";
import { parts } from "./parts.js";
import { users } from "./users.js";

export const grns = sqliteTable("grns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  grnNo: text("grn_no").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  theirBillNo: text("their_bill_no").notNull().default(""),
  billDate: text("bill_date").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  paidNowCents: integer("paid_now_cents").notNull().default(0),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const grnItems = sqliteTable("grn_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  grnId: integer("grn_id").notNull().references(() => grns.id),
  partId: integer("part_id").notNull().references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }).notNull(),
  qty: integer("qty").notNull(),
  freeQty: integer("free_qty").notNull().default(0),
  unitCostCents: integer("unit_cost_cents").notNull(),
  newSellPriceCents: integer("new_sell_price_cents"),
  supplierPartNo: text("supplier_part_no").notNull().default(""),
});
