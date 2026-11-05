import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sales } from "./sales.js";
import { users } from "./users.js";

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paymentNo: text("payment_no").notNull().unique(),
  type: text("type", { enum: ["customer_credit", "supplier"] }).notNull(),
  partyId: integer("party_id").notNull(),
  saleId: integer("sale_id").references(() => sales.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method", { enum: ["cash", "card", "cheque", "bank_transfer"] }).notNull().default("cash"),
  chequeNo: text("cheque_no").notNull().default(""),
  chequeDate: text("cheque_date"),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
});
