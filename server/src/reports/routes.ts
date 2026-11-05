import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { sales, customers, suppliers, serviceJobs } from "../db/schema/index.js";
import {
  overviewReport, staffReport, servicesReport, discountsReport,
  stockAnalysisReport, stockValueReport, toOrderReport,
  type DateRange,
} from "./aggregate.js";
import { customerBalanceCents } from "../customers/balance.js";
import { supplierBalanceCents } from "../suppliers/balance.js";

function parseRange(q: { from?: string; to?: string }): DateRange | { error: string } {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!q.from || !q.to || !dateRe.test(q.from) || !dateRe.test(q.to)) return { error: "Pick a date range" };
  if (q.from > q.to) return { error: "From date must be on or before To date" };
  return { from: q.from, to: q.to };
}

export default async function reportsRoutes(app: FastifyInstance) {
  app.get("/api/reports/overview", { preHandler: app.requireOwner }, async (req, reply) => {
    const range = parseRange(req.query as { from?: string; to?: string });
    if ("error" in range) return reply.code(400).send({ error: range.error });
    return overviewReport(range);
  });

  app.get("/api/reports/staff", { preHandler: app.requireOwner }, async (req, reply) => {
    const range = parseRange(req.query as { from?: string; to?: string });
    if ("error" in range) return reply.code(400).send({ error: range.error });
    return { rows: staffReport(range) };
  });

  app.get("/api/reports/services", { preHandler: app.requireOwner }, async (req, reply) => {
    const range = parseRange(req.query as { from?: string; to?: string });
    if ("error" in range) return reply.code(400).send({ error: range.error });
    const result = servicesReport(range);
    result.openJobsNow = db.select().from(serviceJobs).where(eq(serviceJobs.status, "open")).all().length;
    return result;
  });

  app.get("/api/reports/discounts", { preHandler: app.requireOwner }, async (req, reply) => {
    const range = parseRange(req.query as { from?: string; to?: string });
    if ("error" in range) return reply.code(400).send({ error: range.error });
    return discountsReport(range);
  });

  app.get("/api/reports/stock-analysis", { preHandler: app.requireOwner }, async () => {
    return { rows: stockAnalysisReport() };
  });

  app.get("/api/reports/stock-value", { preHandler: app.requireOwner }, async () => {
    return stockValueReport();
  });

  app.get("/api/reports/to-order", { preHandler: app.requireOwner }, async () => {
    return toOrderReport();
  });

  // Dashboard-facing summary: today's totals, balances, open jobs, and last-7-days daily chart data.
  app.get("/api/dashboard/summary", { preHandler: app.requireAuth }, async (req) => {
    const user = req.session.user!;
    const isOwner = user.role === "owner";
    const canSeeProfit = isOwner || user.canCost;

    // Today in Asia/Colombo — approximate with UTC+5:30 offset for now.
    const nowColombo = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const today = nowColombo.toISOString().slice(0, 10);

    // Shopkeepers see their own bills only; the owner sees the whole shop.
    const mine = isOwner ? undefined : user.id;
    const todayReport = overviewReport({ from: today, to: today }, mine);

    let customersOweCents = 0;
    let suppliersOweCents = 0;
    if (isOwner) {
      customersOweCents = db.select().from(customers).all().reduce((sum, c) => sum + Math.max(0, customerBalanceCents(c.id)), 0);
      suppliersOweCents = db.select().from(suppliers).all().reduce((sum, s) => sum + Math.max(0, supplierBalanceCents(s.id)), 0);
    }

    // Open + cancelled job counts (all staff can see open jobs on dashboard).
    const allJobs = db.select({ status: serviceJobs.status }).from(serviceJobs).all();
    const openJobsCount = allJobs.filter((j) => j.status === "open").length;

    // Last 7 days daily totals for the sparkline/bar chart (today is day 7).
    const days: { date: string; salesCents: number; partsRevenueCents: number; serviceRevenueCents: number; billsCount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowColombo);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const r = overviewReport({ from: dateStr, to: dateStr }, mine);
      days.push({ date: dateStr, salesCents: r.totalSalesCents, partsRevenueCents: r.partsRevenueCents, serviceRevenueCents: r.serviceRevenueCents, billsCount: r.billsCount });
    }

    return {
      scope: isOwner ? "shop" : "mine",
      todaySalesCents: todayReport.totalSalesCents,
      todayPartsRevenueCents: todayReport.partsRevenueCents,
      todayServiceRevenueCents: todayReport.serviceRevenueCents,
      todayProfitCents: canSeeProfit ? todayReport.grossProfitCents : null,
      todayBillsCount: todayReport.billsCount,
      customersOweCents: isOwner ? customersOweCents : null,
      suppliersOweCents: isOwner ? suppliersOweCents : null,
      openJobsCount,
      last7Days: days,
    };
  });

  // CSV export for the Overview tab's sales lines.
  app.get("/api/reports/overview.csv", { preHandler: app.requireOwner }, async (req, reply) => {
    const range = parseRange(req.query as { from?: string; to?: string });
    if ("error" in range) return reply.code(400).send({ error: range.error });

    const rows = db.select().from(sales).where(and(
      // Reuse same date-range predicate shape as aggregate.ts via inline sqlite comparison on createdAt.
      eq(sales.status, "completed"),
    )).all().filter((s) => s.createdAt >= range.from && s.createdAt <= `${range.to}T23:59:59.999Z`);

    const headers = ["Invoice", "Date", "Customer", "Payment", "Discount %", "Subtotal", "Discount", "Tax", "Total"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const toRs = (c: number) => (c / 100).toFixed(2);
    const lines = [headers.map(escape).join(",")];

    for (const s of rows) {
      const customer = s.customerId ? db.select().from(customers).where(eq(customers.id, s.customerId)).get() : null;
      lines.push([
        s.invoiceNo, s.createdAt.slice(0, 10), customer?.name ?? "",
        s.paymentMethod, String(s.discountPct),
        toRs(s.subtotalCents), toRs(s.discountCents), toRs(s.taxCents), toRs(s.totalCents),
      ].map(escape).join(","));
    }

    reply.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="sales-${range.from}-to-${range.to}.csv"`);
    return lines.join("\n");
  });
}
