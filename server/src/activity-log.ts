import { db } from "./db/client.js";
import { activityLog } from "./db/schema/index.js";

type Action =
  | "login" | "login_failed"
  | "owner_auth_ok" | "owner_auth_failed"
  | "sale" | "void" | "stock_change"
  | "part_created" | "part_edited" | "part_deleted"
  | "price_change" | "cost_change"
  | "credit_approved" | "payment"
  | "grn" | "return" | "supplier_created"
  | "job_created" | "job_updated" | "job_deleted" | "job_cancelled"
  | "preorder_created" | "preorder_edited" | "preorder_status_changed"
  | "service_price_list_changed"
  | "advance_given" | "payslip_paid" | "staff_created" | "staff_edited"
  | "settings_changed" | "backup";

export function logActivity(entry: {
  userId: number | null;
  action: Action;
  entityType?: string;
  entityId?: number;
  details?: Record<string, unknown>;
}) {
  db.insert(activityLog).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details,
    createdAt: new Date().toISOString(),
  }).run();
}
