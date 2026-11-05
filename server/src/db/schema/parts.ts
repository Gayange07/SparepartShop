import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { suppliers } from "./suppliers.js";
import { users } from "./users.js";

export const parts = sqliteTable("parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partNo: text("part_no").notNull().unique(),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  category: text("category").notNull(),
  vehicleType: text("vehicle_type", { enum: ["Motorcycle", "Three-wheeler", "Both"] }).notNull(),
  rack: text("rack").notNull().default(""),
  models: text("models", { mode: "json" }).notNull().$type<string[]>(),
  unit: text("unit"),
  sells: text("sells"),
  brandItem: integer("brand_item", { mode: "boolean" }),
  vehicleClass: text("vehicle_class"),
  priceEstimated: integer("price_estimated", { mode: "boolean" }),
  priceSource: text("price_source"),
  priceSourceUrl: text("price_source_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const partSupplierNumbers = sqliteTable("part_supplier_numbers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partId: integer("part_id").notNull().references(() => parts.id),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  supplierPartNo: text("supplier_part_no").notNull(),
}, (t) => [uniqueIndex("supplier_part_no_idx").on(t.supplierId, t.supplierPartNo)]);

export const partGrades = sqliteTable("part_grades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partId: integer("part_id").notNull().references(() => parts.id),
  grade: text("grade", { enum: ["GEN", "AA", "A"] }).notNull(),
  costCents: integer("cost_cents").notNull().default(0),
  priceCents: integer("price_cents"),
  qty: integer("qty").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(0),
}, (t) => [uniqueIndex("part_grade_idx").on(t.partId, t.grade)]);
