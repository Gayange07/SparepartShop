import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { customers } from "./customers.js";
import { parts } from "./parts.js";
import { users, mechanics } from "./users.js";

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNo: text("invoice_no").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  vehicleNo: text("vehicle_no").notNull().default(""),
  mechanicId: integer("mechanic_id").references(() => mechanics.id),
  jobId: integer("job_id"),
  preOrderId: integer("pre_order_id"),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountPct: integer("discount_pct").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  autoDiscountApplied: integer("auto_discount_applied", { mode: "boolean" }).notNull().default(false),
  roundOffCents: integer("round_off_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  advanceDeductedCents: integer("advance_deducted_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  paymentMethod: text("payment_method", { enum: ["cash", "card", "credit"] }).notNull(),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  changeCents: integer("change_cents").notNull().default(0),
  status: text("status", { enum: ["completed", "voided"] }).notNull().default("completed"),
  voidedAt: text("voided_at"),
  voidedBy: integer("voided_by").references(() => users.id),
  voidReason: text("void_reason"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
}, (t) => [
  index("sales_created_at_idx").on(t.createdAt),
  index("sales_customer_id_idx").on(t.customerId),
  index("sales_created_by_idx").on(t.createdBy),
]);

export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  partId: integer("part_id").notNull().references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }).notNull(),
  qty: integer("qty").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull(),
});

export const saleServices = sqliteTable("sale_services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  mechanicId: integer("mechanic_id").references(() => mechanics.id),
});
