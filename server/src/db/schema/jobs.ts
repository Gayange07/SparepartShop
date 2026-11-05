import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { customers } from "./customers.js";
import { mechanics, users } from "./users.js";
import { sales } from "./sales.js";
import { parts } from "./parts.js";

export const servicePriceList = sqliteTable("service_price_list", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const serviceJobs = sqliteTable("service_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNo: text("job_no").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  vehicleNo: text("vehicle_no").notNull().default(""),
  model: text("model").notNull().default(""),
  mechanicId: integer("mechanic_id").references(() => mechanics.id),
  note: text("note").notNull().default(""),
  status: text("status", { enum: ["open", "billed", "cancelled"] }).notNull().default("open"),
  saleId: integer("sale_id").references(() => sales.id),
  cancelledAt: text("cancelled_at"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelReason: text("cancel_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const jobServices = sqliteTable("job_services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => serviceJobs.id),
  serviceListId: integer("service_list_id").references(() => servicePriceList.id),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  qty: integer("qty").notNull().default(1),
});

export const jobParts = sqliteTable("job_parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => serviceJobs.id),
  partId: integer("part_id").notNull().references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }).notNull(),
  qty: integer("qty").notNull(),
});
