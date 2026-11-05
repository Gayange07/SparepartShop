import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  vehicleNo: text("vehicle_no").notNull().default(""),
  manufacturer: text("manufacturer").notNull().default(""),
  model: text("model").notNull().default(""),
  nic: text("nic").notNull().default(""),
  address: text("address").notNull().default(""),
  creditLimitCents: integer("credit_limit_cents").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
