import { z } from "zod";
import { GradeKey } from "./parts.js";

export const PreOrderInput = z.object({
  customerId: z.number().int().positive().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().min(1, "Customer phone is required"),
  vehicle: z.string().default(""),
  partId: z.number().int().positive().optional(),
  grade: GradeKey.optional(),
  qty: z.number().int().positive().default(1),
  partDescription: z.string().min(1, "Describe the part"),
  advancePaidCents: z.number().int().nonnegative().default(0),
  orderDate: z.string().min(1),
  promisedDate: z.string().min(1, "Set the promised date"),
  note: z.string().default(""),
});
export type PreOrderInput = z.infer<typeof PreOrderInput>;

/** Days between today and the promised date (negative = overdue). Dates are plain YYYY-MM-DD strings, compared at midnight. */
export function daysUntil(promisedDate: string, today: Date = new Date()): number {
  const promised = new Date(promisedDate + "T00:00:00");
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = promised.getTime() - start.getTime();
  return Math.round(diffMs / 86400000);
}

/** Pre-orders show red when the promised date is <= 2 days away or already passed. */
export function isPreOrderUrgent(promisedDate: string, today: Date = new Date()): boolean {
  return daysUntil(promisedDate, today) <= 2;
}
