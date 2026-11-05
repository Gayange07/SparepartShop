import type { GradeKey } from "shared";
import { useSessionState } from "@/lib/cart";

export type QueuedReturn = {
  saleId: number;
  invoiceNo: string;
  partId: number;
  partNo: string;
  partName: string;
  grade: GradeKey;
  qty: number;
  unitPriceCents: number;
  reason: string;
  billAgedDays: number;
};

export function useReturnsCart() {
  const [returns, setReturns] = useSessionState<QueuedReturn[]>("pos.returns", []);

  const add = (r: QueuedReturn) => setReturns((rs) => {
    const existing = rs.findIndex((x) => x.saleId === r.saleId && x.partId === r.partId && x.grade === r.grade);
    if (existing >= 0) return rs.map((x, i) => (i === existing ? { ...x, qty: x.qty + r.qty, reason: r.reason || x.reason } : x));
    return [...rs, r];
  });

  const removeAt = (i: number) => setReturns((rs) => rs.filter((_, j) => j !== i));
  const clear = () => setReturns([]);

  const returnCreditCents = returns.reduce((s, r) => s + r.qty * r.unitPriceCents, 0);
  const anyAged = returns.some((r) => r.billAgedDays > 2);

  return { returns, add, removeAt, clear, returnCreditCents, anyAged };
}
