import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { customers } from "./customers.js";
import { sales } from "./sales.js";
import { users } from "./users.js";
import { parts } from "./parts.js";

export const preOrders = sqliteTable("pre_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  preOrderNo: text("pre_order_no").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  partId: integer("part_id").references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }),
  qty: integer("qty").notNull().default(1),
  partDescription: text("part_description").notNull(),
  vehicle: text("vehicle").notNull().default(""),
  orderDate: text("order_date").notNull(),
  promisedDate: text("promised_date").notNull(),
  note: text("note").notNull().default(""),
  status: text("status", { enum: ["pending", "arrived", "delivered", "cancelled"] }).notNull().default("pending"),
  advancePaidCents: integer("advance_paid_cents").notNull().default(0),
  saleId: integer("sale_id").references(() => sales.id),
  recordedBy: integer("recorded_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const missingParts = sqliteTable("missing_parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description").notNull(),
  manufacturer: text("manufacturer").notNull().default(""),
  model: text("model").notNull().default(""),
  category: text("category").notNull().default(""),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  note: text("note").notNull().default(""),
  recordedBy: integer("recorded_by").references(() => users.id),
  status: text("status", { enum: ["open", "ordered", "resolved"] }).notNull().default("open"),
  createdAt: text("created_at").notNull(),
});
