import type { GradeKey } from "shared";

/**
 * Carries a job or pre-order's items into the POS cart across navigation.
 * POS reads and clears this on mount — a simple module-level handoff instead of
 * wiring a global cart store just for this one cross-page transfer.
 */
export type PendingBill = {
  jobId?: number;
  preOrderId?: number;
  mechanicId?: number;
  customer?: { id?: number; name: string; phone: string };
  vehicleNo?: string;
  lines: { partId: number; grade: GradeKey; qty: number }[];
  services: { description: string; amountRupees: number; mechanicId?: number }[];
  advancePaidRupees?: number;
};

let pending: PendingBill | null = null;

export function setPendingBill(bill: PendingBill) {
  pending = bill;
}

export function takePendingBill(): PendingBill | null {
  const bill = pending;
  pending = null;
  return bill;
}
