import * as React from "react";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/customers";

export type SaleListRow = {
  id: number; invoiceNo: string; createdAt: string; vehicleNo: string;
  customerId: number | null; customer: Customer | null; billedByName: string;
  paymentMethod: "cash" | "card" | "credit"; discountPct: number; autoDiscountApplied: boolean;
  totalCents: number; status: "completed" | "voided";
};

export type SaleFilters = { from: string; to: string; q: string; discountedOnly: boolean };

export function useSalesHistory(filters: SaleFilters) {
  const [sales, setSales] = React.useState<SaleListRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.discountedOnly) params.set("discountedOnly", "1");
    const res = await api<{ sales: SaleListRow[] }>(`/sales?${params}`, { method: "GET" });
    if (res.ok) setSales(res.data.sales);
    setLoading(false);
  }, [filters.from, filters.to, filters.q, filters.discountedOnly]);

  React.useEffect(() => {
    const timer = setTimeout(reload, 200);
    return () => clearTimeout(timer);
  }, [reload]);

  return { sales, loading, reload };
}

export type SaleDetail = {
  sale: SaleListRow & { subtotalCents: number; discountCents: number; taxCents: number; roundOffCents: number; amountPaidCents: number; changeCents: number; voidReason: string | null; voidedAt: string | null };
  items: { id: number; partId: number; grade: "GEN" | "AA" | "A"; qty: number; unitPriceCents: number; alreadyReturnedQty: number; returnRefs: { returnNo: string; qty: number; createdAt: string }[]; part: { id: number; name: string; partNo: string } }[];
  services: { id: number; description: string; amountCents: number; mechanicId: number | null }[];
  customer: Customer | null;
  voidedByName: string | null;
};

export async function fetchSale(id: number) {
  return api<SaleDetail>(`/sales/${id}`, { method: "GET" });
}

export async function voidSale(id: number, reason: string, ownerAuthPassword: string) {
  return api<{ error?: string }>(`/sales/${id}/void`, { method: "POST", body: { reason, ownerAuthPassword } });
}
