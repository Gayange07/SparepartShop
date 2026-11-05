import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  action: text("action", {
    enum: [
      "login", "login_failed",
      "owner_auth_ok", "owner_auth_failed",
      "sale", "void", "stock_change",
      "part_created", "part_edited", "part_deleted",
      "price_change", "cost_change",
      "credit_approved", "payment",
      "grn", "return", "supplier_created",
      "job_created", "job_updated", "job_deleted", "job_cancelled",
      "preorder_created", "preorder_edited", "preorder_status_changed",
      "service_price_list_changed",
      "advance_given", "payslip_paid", "staff_created", "staff_edited",
      "settings_changed", "backup",
    ],
  }).notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull(),
});
