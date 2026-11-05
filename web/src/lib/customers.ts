import * as React from "react";
import { api } from "@/lib/api";

export type Customer = {
  id: number; name: string; phone: string; vehicleNo: string;
  manufacturer: string; model: string; nic: string; address: string; creditLimitCents: number;
};
export type CustomerWithBalance = Customer & { balanceCents: number; createdAt: string };

export type BoughtLine = { saleId: number; invoiceNo: string; date: string; voided: boolean; item: string; grade: string | null; qty: number; amountCents: number };
export type CustomerJob = { id: number; jobNo: string; status: "open" | "billed"; mechanicId: number | null; workSummary: string; createdAt: string };
export type CustomerPreOrder = { id: number; preOrderNo: string; partDescription: string; promisedDate: string; status: string };
export type CustomerDetail = {
  customer: Customer;
  balanceCents: number; totalSpentCents: number; billsCount: number; jobsCount: number;
  bought: BoughtLine[]; jobs: CustomerJob[]; preOrders: CustomerPreOrder[];
};
export type LedgerRow = { date: string; ref: string; details: string; owedCents: number; paidCents: number; balanceCents: number };

export function useCustomerSearch(query: string) {
  const [results, setResults] = React.useState<Customer[]>([]);

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      api<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(query)}`, { method: "GET" }).then((r) => r.ok && setResults(r.data.customers));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return results;
}

export function useCustomers(query: string, owingOnly: boolean) {
  const [customers, setCustomers] = React.useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (owingOnly) params.set("owing", "1");
    const res = await api<{ customers: CustomerWithBalance[] }>(`/customers?${params}`, { method: "GET" });
    if (res.ok) setCustomers(res.data.customers);
    setLoading(false);
  }, [query, owingOnly]);

  React.useEffect(() => {
    const timer = setTimeout(reload, 200);
    return () => clearTimeout(timer);
  }, [reload]);

  return { customers, loading, reload };
}

export async function fetchCustomerDetail(id: number) {
  return api<CustomerDetail>(`/customers/${id}`, { method: "GET" });
}

export async function fetchCustomerStatement(id: number) {
  return api<{ customer: Customer; ledger: LedgerRow[] }>(`/customers/${id}/statement`, { method: "GET" });
}
