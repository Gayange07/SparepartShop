import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "shopkeeper"] }).notNull(),
  canStock: integer("can_stock", { mode: "boolean" }).notNull().default(false),
  canCost: integer("can_cost", { mode: "boolean" }).notNull().default(false),
  salaryCents: integer("salary_cents").notNull().default(0),
  commissionPct: integer("commission_pct").notNull().default(0),
  monthlyTargetCents: integer("monthly_target_cents").notNull().default(0),
  targetBonusCents: integer("target_bonus_cents").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const mechanics = sqliteTable("mechanics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  salaryCents: integer("salary_cents").notNull().default(0),
  commissionPct: integer("commission_pct").notNull().default(0),
  monthlyTargetCents: integer("monthly_target_cents").notNull().default(0),
  targetBonusCents: integer("target_bonus_cents").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
