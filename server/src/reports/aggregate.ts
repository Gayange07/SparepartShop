import { eq, and, gte, lte } from "drizzle-orm";
import { computeCommission } from "shared";
import { db } from "../db/client.js";
import {
  sales, saleItems, saleServices, parts, partGrades, users, mechanics,
  payments, stockMovements, missingParts, preOrders,
} from "../db/schema/index.js";

export type DateRange = { from: string; to: string };

function rangeWhere(range: DateRange) {
  return and(gte(sales.createdAt, range.from), lte(sales.createdAt, `${range.to}T23:59:59.999Z`));
}

/** Loads every sale in range once, with its items and services attached, for reuse across all report tabs. */
function loadSalesInRange(range: DateRange) {
  const rows = db.select().from(sales).where(rangeWhere(range)).all();
  return rows.map((s) => ({
    sale: s,
    items: db.select().from(saleItems).where(eq(saleItems.saleId, s.id)).all(),
    services: db.select().from(saleServices).where(eq(saleServices.saleId, s.id)).all(),
  }));
}

function lineCostCents(items: typeof saleItems.$inferSelect[]) {
  return items.reduce((sum, i) => sum + i.qty * i.unitCostCents, 0);
}
function saleProfitCents(s: typeof sales.$inferSelect, items: typeof saleItems.$inferSelect[]) {
  return s.totalCents - s.taxCents - lineCostCents(items);
}

export function overviewReport(range: DateRange, createdBy?: number) {
  const rows = loadSalesInRange(range).filter((r) => createdBy === undefined || r.sale.createdBy === createdBy);
  const completed = rows.filter((r) => r.sale.status === "completed");
  const voidedCount = rows.length - completed.length;

  const totalSalesCents = completed.reduce((s, r) => s + r.sale.totalCents, 0);
  const costOfPartsSoldCents = completed.reduce((s, r) => s + lineCostCents(r.items), 0);
  const grossProfitCents = completed.reduce((s, r) => s + saleProfitCents(r.sale, r.items), 0);
  const partsSoldQty = completed.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty, 0), 0);
  const servicesCount = completed.reduce((s, r) => s + r.services.length, 0);
  const partsRevenueCents = completed.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty * i.unitPriceCents, 0), 0);
  const serviceRevenueCents = completed.reduce((s, r) => s + r.services.reduce((x, sv) => x + sv.amountCents, 0), 0);
  const discountCents = completed.reduce((s, r) => s + r.sale.discountCents, 0);
  const discountedBillsCount = completed.filter((r) => r.sale.discountPct > 0).length;
  const avgDiscountPct = discountedBillsCount
    ? Math.round(completed.filter((r) => r.sale.discountPct > 0).reduce((s, r) => s + r.sale.discountPct, 0) / discountedBillsCount)
    : 0;

  const creditPayments = db.select().from(payments)
    .where(and(eq(payments.type, "customer_credit"), gte(payments.createdAt, range.from), lte(payments.createdAt, `${range.to}T23:59:59.999Z`)))
    .all();
  const creditCollectedCents = creditPayments.reduce((s, p) => s + p.amountCents, 0);

  const byDay = new Map<string, { bills: number; parts: number; salesCents: number; profitCents: number }>();
  for (const r of completed) {
    const day = r.sale.createdAt.slice(0, 10);
    const entry = byDay.get(day) ?? { bills: 0, parts: 0, salesCents: 0, profitCents: 0 };
    entry.bills += 1;
    entry.parts += r.items.reduce((x, i) => x + i.qty, 0);
    entry.salesCents += r.sale.totalCents;
    entry.profitCents += saleProfitCents(r.sale, r.items);
    byDay.set(day, entry);
  }
  const dayByDay = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const byPaymentType = (["cash", "card", "credit"] as const).map((method) => {
    const matching = completed.filter((r) => r.sale.paymentMethod === method);
    return {
      method, bills: matching.length,
      amountCents: matching.reduce((s, r) => s + r.sale.totalCents, 0),
      stillOnCreditCents: method === "credit" ? matching.reduce((s, r) => s + (r.sale.totalCents - r.sale.amountPaidCents), 0) : 0,
    };
  });

  const byGrade = (["GEN", "AA", "A"] as const).map((grade) => {
    const lines = completed.flatMap((r) => r.items.filter((i) => i.grade === grade));
    return {
      grade, qty: lines.reduce((s, i) => s + i.qty, 0),
      salesCents: lines.reduce((s, i) => s + i.qty * i.unitPriceCents, 0),
      profitCents: lines.reduce((s, i) => s + i.qty * (i.unitPriceCents - i.unitCostCents), 0),
    };
  });

  const partTotals = new Map<number, { qty: number; salesCents: number }>();
  for (const r of completed) {
    for (const i of r.items) {
      const entry = partTotals.get(i.partId) ?? { qty: 0, salesCents: 0 };
      entry.qty += i.qty;
      entry.salesCents += i.qty * i.unitPriceCents;
      partTotals.set(i.partId, entry);
    }
  }
  const topParts = [...partTotals.entries()]
    .sort(([, a], [, b]) => b.qty - a.qty)
    .slice(0, 15)
    .map(([partId, v]) => {
      const part = db.select().from(parts).where(eq(parts.id, partId)).get();
      return { partId, partNo: part?.partNo ?? "", name: part?.name ?? "", ...v };
    });

  return {
    totalSalesCents, billsCount: completed.length, voidedCount,
    grossProfitCents, costOfPartsSoldCents,
    partsSoldQty, servicesCount, partsRevenueCents, serviceRevenueCents,
    discountCents, discountedBillsCount, avgDiscountPct,
    creditCollectedCents,
    dayByDay, byPaymentType, byGrade, topParts,
  };
}

export function staffReport(range: DateRange) {
  const rows = loadSalesInRange(range).filter((r) => r.sale.status === "completed");

  const staffRows = [
    ...db.select().from(users).where(eq(users.role, "shopkeeper")).all().map((u) => ({ staffType: "user" as const, id: u.id, name: u.name, role: "Shopkeeper", settings: u })),
    ...db.select().from(mechanics).all().map((m) => ({ staffType: "mechanic" as const, id: m.id, name: m.name, role: "Mechanic", settings: m })),
  ];

  return staffRows.map((staff) => {
    if (staff.staffType === "user") {
      const theirSales = rows.filter((r) => r.sale.createdBy === staff.id);
      const profitCents = theirSales.reduce((s, r) => s + saleProfitCents(r.sale, r.items), 0);
      const commission = computeCommission(profitCents, staff.settings);
      return {
        staffType: staff.staffType, staffId: staff.id, name: staff.name, role: staff.role,
        billsMade: theirSales.length, jobsDone: 0,
        partsSold: theirSales.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty, 0), 0),
        servicesCount: theirSales.reduce((s, r) => s + r.services.length, 0),
        salesCents: theirSales.reduce((s, r) => s + r.sale.totalCents, 0),
        discountCents: theirSales.reduce((s, r) => s + r.sale.discountCents, 0),
        profitCents, commissionPct: staff.settings.commissionPct, commissionCents: commission.commissionCents,
      };
    }
    const theirServiceLines = rows.flatMap((r) => r.services.filter((sv) => sv.mechanicId === staff.id).map((sv) => ({ sv, sale: r.sale })));
    const profitCents = theirServiceLines.reduce((s, l) => s + l.sv.amountCents, 0);
    const commission = computeCommission(profitCents, staff.settings);
    return {
      staffType: staff.staffType, staffId: staff.id, name: staff.name, role: staff.role,
      billsMade: 0, jobsDone: new Set(theirServiceLines.map((l) => l.sale.id)).size,
      partsSold: 0, servicesCount: theirServiceLines.length,
      salesCents: theirServiceLines.reduce((s, l) => s + l.sv.amountCents, 0),
      discountCents: 0,
      profitCents, commissionPct: staff.settings.commissionPct, commissionCents: commission.commissionCents,
    };
  });
}

export function servicesReport(range: DateRange) {
  const rows = loadSalesInRange(range).filter((r) => r.sale.status === "completed");
  const serviceLines = rows.flatMap((r) => r.services.map((sv) => ({ sv, sale: r.sale })));

  const serviceBillsCount = rows.filter((r) => r.services.length > 0).length;
  const serviceChargesCents = serviceLines.reduce((s, l) => s + l.sv.amountCents, 0);
  const openJobsNow = 0; // populated by the route (needs a non-date-ranged live count)

  const byTypeMap = new Map<string, { count: number; amountCents: number }>();
  for (const l of serviceLines) {
    const entry = byTypeMap.get(l.sv.description) ?? { count: 0, amountCents: 0 };
    entry.count += 1;
    entry.amountCents += l.sv.amountCents;
    byTypeMap.set(l.sv.description, entry);
  }
  const byServiceType = [...byTypeMap.entries()].sort(([, a], [, b]) => b.amountCents - a.amountCents)
    .map(([description, v]) => ({ description, ...v }));

  const byMechanicMap = new Map<number, { jobs: Set<number>; billTotalCents: number; profitCents: number }>();
  for (const l of serviceLines) {
    if (!l.sv.mechanicId) continue;
    const entry = byMechanicMap.get(l.sv.mechanicId) ?? { jobs: new Set<number>(), billTotalCents: 0, profitCents: 0 };
    entry.jobs.add(l.sale.id);
    entry.billTotalCents += l.sv.amountCents;
    entry.profitCents += l.sv.amountCents;
    byMechanicMap.set(l.sv.mechanicId, entry);
  }
  const byMechanic = [...byMechanicMap.entries()].map(([mechanicId, v]) => {
    const mechanic = db.select().from(mechanics).where(eq(mechanics.id, mechanicId)).get();
    return { mechanicId, name: mechanic?.name ?? "", jobsCount: v.jobs.size, billTotalCents: v.billTotalCents, profitCents: v.profitCents };
  }).sort((a, b) => b.billTotalCents - a.billTotalCents);

  const history = rows.filter((r) => r.services.length > 0).map((r) => ({
    saleId: r.sale.id, invoiceNo: r.sale.invoiceNo, date: r.sale.createdAt,
    services: r.services.map((sv) => sv.description).join(", "),
    amountCents: r.services.reduce((s, sv) => s + sv.amountCents, 0),
  })).sort((a, b) => b.date.localeCompare(a.date));

  return { serviceBillsCount, serviceChargesCents, openJobsNow, byServiceType, byMechanic, history };
}

export function discountsReport(range: DateRange) {
  const rows = loadSalesInRange(range).filter((r) => r.sale.status === "completed");
  const discounted = rows.filter((r) => r.sale.discountPct > 0);

  const totalDiscountCents = discounted.reduce((s, r) => s + r.sale.discountCents, 0);
  const autoCount = discounted.filter((r) => r.sale.autoDiscountApplied).length;
  const manualCount = discounted.length - autoCount;

  const byStaffMap = new Map<number, { bills: number; discountCents: number }>();
  for (const r of discounted) {
    const entry = byStaffMap.get(r.sale.createdBy) ?? { bills: 0, discountCents: 0 };
    entry.bills += 1;
    entry.discountCents += r.sale.discountCents;
    byStaffMap.set(r.sale.createdBy, entry);
  }
  const byStaff = [...byStaffMap.entries()].map(([userId, v]) => {
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    return { userId, name: u?.name ?? "", ...v };
  }).sort((a, b) => b.discountCents - a.discountCents);

  const history = discounted.map((r) => ({
    saleId: r.sale.id, invoiceNo: r.sale.invoiceNo, date: r.sale.createdAt,
    discountPct: r.sale.discountPct, discountCents: r.sale.discountCents,
    autoDiscountApplied: r.sale.autoDiscountApplied, totalCents: r.sale.totalCents,
  })).sort((a, b) => b.date.localeCompare(a.date));

  return {
    discountedBillsCount: discounted.length, totalBillsCount: rows.length,
    totalDiscountCents, autoCount, manualCount, byStaff, history,
  };
}

export function stockAnalysisReport() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();

  const allGrades = db.select().from(partGrades).all();
  const soldMovements = db.select().from(stockMovements).where(eq(stockMovements.reason, "sale")).all();

  return allGrades.filter((g) => g.priceCents !== null).map((g) => {
    const part = db.select().from(parts).where(eq(parts.id, g.partId)).get();
    const movements = soldMovements.filter((m) => m.partId === g.partId && m.grade === g.grade);
    const sold30 = -movements.filter((m) => m.createdAt >= d30).reduce((s, m) => s + m.qtyDelta, 0);
    const sold90 = -movements.filter((m) => m.createdAt >= d90).reduce((s, m) => s + m.qtyDelta, 0);
    const dailyRate = sold90 / 90;
    const daysOfStock = dailyRate > 0 ? Math.round(g.qty / dailyRate) : g.qty > 0 ? Infinity : 0;

    let status: "reorder" | "fast" | "not_selling" | "overstocked" | "ok" = "ok";
    if (g.qty <= g.reorderLevel) status = "reorder";
    else if (sold90 === 0) status = "not_selling";
    else if (daysOfStock < 21) status = "fast";
    else if (daysOfStock > 120) status = "overstocked";

    return {
      partId: g.partId, partNo: part?.partNo ?? "", name: part?.name ?? "", manufacturer: part?.manufacturer ?? "",
      grade: g.grade, qty: g.qty, reorderLevel: g.reorderLevel,
      sold30, sold90, daysOfStock: Number.isFinite(daysOfStock) ? daysOfStock : null, status,
    };
  });
}

export function stockValueReport() {
  const allGrades = db.select().from(partGrades).all();
  const byManufacturerGrade = new Map<string, { manufacturer: string; grade: string; items: number; costCents: number; priceCents: number }>();

  for (const g of allGrades) {
    if (g.qty <= 0) continue;
    const part = db.select().from(parts).where(eq(parts.id, g.partId)).get();
    const manufacturer = part?.manufacturer ?? "Unknown";
    const key = `${manufacturer}|${g.grade}`;
    const entry = byManufacturerGrade.get(key) ?? { manufacturer, grade: g.grade, items: 0, costCents: 0, priceCents: 0 };
    entry.items += g.qty;
    entry.costCents += g.qty * g.costCents;
    entry.priceCents += g.qty * (g.priceCents ?? 0);
    byManufacturerGrade.set(key, entry);
  }

  const rows = [...byManufacturerGrade.values()].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.grade.localeCompare(b.grade));
  const itemsInStock = rows.reduce((s, r) => s + r.items, 0);
  const valueAtCostCents = rows.reduce((s, r) => s + r.costCents, 0);
  const valueAtPriceCents = rows.reduce((s, r) => s + r.priceCents, 0);

  return { itemsInStock, valueAtCostCents, valueAtPriceCents, possibleProfitCents: valueAtPriceCents - valueAtCostCents, rows };
}

export function toOrderReport() {
  const lowStock = db.select().from(partGrades).all().filter((g) => g.priceCents !== null && g.qty <= g.reorderLevel).map((g) => {
    const part = db.select().from(parts).where(eq(parts.id, g.partId)).get();
    return { partId: g.partId, partNo: part?.partNo ?? "", name: part?.name ?? "", grade: g.grade, qty: g.qty, reorderLevel: g.reorderLevel };
  });

  const missing = db.select().from(missingParts).where(eq(missingParts.status, "open")).all();
  const preOrdersToGet = db.select().from(preOrders).where(eq(preOrders.status, "pending")).all();

  return { lowStock, missing, preOrdersToGet };
}
