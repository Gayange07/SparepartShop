import * as React from "react";
import type { GradeKey } from "shared";
import { api } from "@/lib/api";

export type Supplier = {
  id: number; name: string; rep: string; phone: string; address: string;
  brands: string; termDays: number; grades: GradeKey[]; note: string;
};
export type SupplierWithBalance = Supplier & { balanceCents: number };

export type GrnRow = { id: number; grnNo: string; supplierName: string; billDate: string; theirBillNo: string; totalCents: number; paidNowCents: number; itemCount: number; createdAt: string };
export type SupplierDetail = { supplier: Supplier; balanceCents: number; grns: GrnRow[]; partNumberMap: { partId: number; partNo: string; partName: string; supplierPartNo: string }[] };
export type LedgerRow = { date: string; ref: string; details: string; owedCents: number; paidCents: number; balanceCents: number };

export function useSuppliers(query: string) {
  const [suppliers, setSuppliers] = React.useState<SupplierWithBalance[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await api<{ suppliers: SupplierWithBalance[] }>("/suppliers", { method: "GET" });
    setSuppliers(res.ok ? res.data.suppliers : []);
    setLoading(false);
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  const filtered = query.trim()
    ? suppliers.filter((s) => [s.name, s.rep, s.phone].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    : suppliers;

  return { suppliers: filtered, loading, reload };
}

export async function fetchSupplierDetail(id: number) {
  return api<SupplierDetail>(`/suppliers/${id}`, { method: "GET" });
}

export async function fetchSupplierStatement(id: number) {
  return api<{ supplier: Supplier; ledger: LedgerRow[] }>(`/suppliers/${id}/statement`, { method: "GET" });
}

export function useRecentGrns() {
  const [grns, setGrns] = React.useState<GrnRow[]>([]);
  React.useEffect(() => {
    api<{ grns: GrnRow[] }>("/grns", { method: "GET" }).then((r) => r.ok && setGrns(r.data.grns));
  }, []);
  return grns;
}

export type RawPart = {
  id: number; partNo: string; name: string; manufacturer: string;
  grades: Partial<Record<GradeKey, { cost?: number; price: number | null; qty: number }>>;
  supplierNumbers: { supplierId: number; supplierPartNo: string }[];
};

export function useAllPartsRaw() {
  const [parts, setParts] = React.useState<RawPart[]>([]);
  React.useEffect(() => {
    api<{ parts: RawPart[] }>("/parts", { method: "GET" }).then((r) => r.ok && setParts(r.data.parts));
  }, []);
  return parts;
}
