import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rep: text("rep").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  brands: text("brands").notNull().default(""),
  termDays: integer("term_days").notNull().default(0),
  grades: text("grades", { mode: "json" }).notNull().$type<("GEN" | "AA" | "A")[]>(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
