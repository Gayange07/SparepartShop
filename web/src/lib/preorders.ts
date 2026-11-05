import * as React from "react";
import type { GradeKey } from "shared";
import { api } from "@/lib/api";

export type PreOrder = {
  id: number; preOrderNo: string; customerId: number | null; partId: number | null; grade: GradeKey | null;
  qty: number; partDescription: string; vehicle: string; orderDate: string; promisedDate: string; note: string;
  status: "pending" | "arrived" | "delivered" | "cancelled"; advancePaidCents: number; saleId: number | null;
  customer: { id: number; name: string; phone: string; address: string; manufacturer: string; model: string } | null;
  part: { id: number; partNo: string; name: string } | null;
};

export function usePreOrders(status?: PreOrder["status"]) {
  const [preOrders, setPreOrders] = React.useState<PreOrder[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await api<{ preOrders: PreOrder[] }>(`/preorders${status ? `?status=${status}` : ""}`, { method: "GET" });
    setPreOrders(res.ok ? res.data.preOrders : []);
    setLoading(false);
  }, [status]);

  React.useEffect(() => { reload(); }, [reload]);

  return { preOrders, loading, reload };
}
