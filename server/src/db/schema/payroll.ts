import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const advances = sqliteTable("advances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffType: text("staff_type", { enum: ["user", "mechanic"] }).notNull(),
  staffId: integer("staff_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  period: text("period").notNull(),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffType: text("staff_type", { enum: ["user", "mechanic"] }).notNull(),
  staffId: integer("staff_id").notNull(),
  date: text("date").notNull(),       // YYYY-MM-DD
  status: text("status", { enum: ["present", "absent", "leave"] }).notNull(),
  note: text("note").notNull().default(""),
  markedBy: integer("marked_by").notNull(),
  markedAt: text("marked_at").notNull(),
});

export const staffExpenses = sqliteTable("staff_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffType: text("staff_type", { enum: ["user", "mechanic"] }).notNull(),
  staffId: integer("staff_id").notNull(),
  period: text("period").notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const payslips = sqliteTable("payslips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffType: text("staff_type", { enum: ["user", "mechanic"] }).notNull(),
  staffId: integer("staff_id").notNull(),
  period: text("period").notNull(),
  salaryCents: integer("salary_cents").notNull().default(0),
  commissionCents: integer("commission_cents").notNull().default(0),
  targetBonusCents: integer("target_bonus_cents").notNull().default(0),
  advancesDeductedCents: integer("advances_deducted_cents").notNull().default(0),
  expensesCents: integer("expenses_cents").notNull().default(0),
  absenceDeductionCents: integer("absence_deduction_cents").notNull().default(0),
  netCents: integer("net_cents").notNull().default(0),
  generatedAt: text("generated_at").notNull(),
});
