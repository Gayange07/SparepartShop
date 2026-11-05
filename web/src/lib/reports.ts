import * as React from "react";
import { api } from "@/lib/api";

export type DateRange = { from: string; to: string };

export type OverviewReport = {
  totalSalesCents: number; billsCount: number; voidedCount: number;
  grossProfitCents: number; costOfPartsSoldCents: number;
  partsSoldQty: number; servicesCount: number;
  discountCents: number; discountedBillsCount: number; avgDiscountPct: number;
  creditCollectedCents: number;
  dayByDay: { date: string; bills: number; parts: number; salesCents: number; profitCents: number }[];
  byPaymentType: { method: string; bills: number; amountCents: number; stillOnCreditCents: number }[];
  byGrade: { grade: string; qty: number; salesCents: number; profitCents: number }[];
  topParts: { partId: number; partNo: string; name: string; qty: number; salesCents: number }[];
};

export type StaffReportRow = {
  staffType: "user" | "mechanic"; staffId: number; name: string; role: string;
  billsMade: number; jobsDone: number; partsSold: number; servicesCount: number;
  salesCents: number; discountCents: number; profitCents: number;
  commissionPct: number; commissionCents: number;
};

export type ServicesReport = {
  serviceBillsCount: number; serviceChargesCents: number; openJobsNow: number;
  byServiceType: { description: string; count: number; amountCents: number }[];
  byMechanic: { mechanicId: number; name: string; jobsCount: number; billTotalCents: number; profitCents: number }[];
  history: { saleId: number; invoiceNo: string; date: string; services: string; amountCents: number }[];
};

export type DiscountsReport = {
  discountedBillsCount: number; totalBillsCount: number;
  totalDiscountCents: number; autoCount: number; manualCount: number;
  byStaff: { userId: number; name: string; bills: number; discountCents: number }[];
  history: { saleId: number; invoiceNo: string; date: string; discountPct: number; discountCents: number; autoDiscountApplied: boolean; totalCents: number }[];
};

export type StockAnalysisRow = {
  partId: number; partNo: string; name: string; manufacturer: string;
  grade: string; qty: number; reorderLevel: number;
  sold30: number; sold90: number; daysOfStock: number | null;
  status: "reorder" | "fast" | "not_selling" | "overstocked" | "ok";
};

export type StockValueReport = {
  itemsInStock: number; valueAtCostCents: number; valueAtPriceCents: number; possibleProfitCents: number;
  rows: { manufacturer: string; grade: string; items: number; costCents: number; priceCents: number }[];
};

export type ToOrderReport = {
  lowStock: { partId: number; partNo: string; name: string; grade: string; qty: number; reorderLevel: number }[];
  missing: { id: number; description: string; manufacturer: string; model: string; customerName: string; customerPhone: string; createdAt: string }[];
  preOrdersToGet: { id: number; preOrderNo: string; partDescription: string; promisedDate: string; qty: number }[];
};

export function useReport<T>(path: string, range: DateRange | null, enabled = true) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const qs = range ? `?from=${range.from}&to=${range.to}` : "";
    api<T>(`${path}${qs}`, { method: "GET" }).then((r) => {
      if (r.ok) setData(r.data);
      setLoading(false);
    });
  }, [path, range?.from, range?.to, enabled]);

  return { data, loading };
}

export function overviewCsvUrl(range: DateRange): string {
  return `/api/reports/overview.csv?from=${range.from}&to=${range.to}`;
}
