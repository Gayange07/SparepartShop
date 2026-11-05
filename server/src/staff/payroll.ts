import { eq, and, gte, lt } from "drizzle-orm";
import { computeCommission, netPayCents, computeAttendanceSummary, type CommissionResult, type AttendanceSummary } from "shared";
import { db } from "../db/client.js";
import { users, mechanics, sales, saleItems, saleServices, advances, staffExpenses, attendance, payslips } from "../db/schema/index.js";

const colomboToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());

function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString();
  return { from, to };
}

/** Shopkeeper profit for the month: full profit of every completed bill they created. */
function shopkeeperProfitCents(userId: number, period: string): number {
  const { from, to } = monthRange(period);
  const monthSales = db.select().from(sales)
    .where(and(eq(sales.createdBy, userId), eq(sales.status, "completed"), gte(sales.createdAt, from), lt(sales.createdAt, to)))
    .all();

  return monthSales.reduce((sum, s) => {
    const items = db.select().from(saleItems).where(eq(saleItems.saleId, s.id)).all();
    const costCents = items.reduce((c, i) => c + i.qty * i.unitCostCents, 0);
    return sum + (s.totalCents - s.taxCents - costCents);
  }, 0);
}

/** Mechanic profit for the month: labour charges on service lines they personally performed (no cost of goods on labour). */
function mechanicProfitCents(mechanicId: number, period: string): number {
  const { from, to } = monthRange(period);
  const lines = db.select({ amountCents: saleServices.amountCents, saleId: saleServices.saleId })
    .from(saleServices).where(eq(saleServices.mechanicId, mechanicId)).all();

  return lines.reduce((sum, line) => {
    const sale = db.select().from(sales).where(eq(sales.id, line.saleId)).get();
    if (!sale || sale.status !== "completed" || sale.createdAt < from || sale.createdAt >= to) return sum;
    return sum + line.amountCents;
  }, 0);
}

function advancesForMonth(staffType: "user" | "mechanic", staffId: number, period: string): number {
  return db.select().from(advances)
    .where(and(eq(advances.staffType, staffType), eq(advances.staffId, staffId), eq(advances.period, period)))
    .all().reduce((sum, a) => sum + a.amountCents, 0);
}

function expensesForMonth(staffType: "user" | "mechanic", staffId: number, period: string): number {
  return db.select().from(staffExpenses)
    .where(and(eq(staffExpenses.staffType, staffType), eq(staffExpenses.staffId, staffId), eq(staffExpenses.period, period)))
    .all().reduce((sum, e) => sum + e.amountCents, 0);
}

function attendanceForMonth(staffType: "user" | "mechanic", staffId: number, period: string): { date: string; status: "present" | "absent" | "leave" }[] {
  return db.select({ date: attendance.date, status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.staffType, staffType), eq(attendance.staffId, staffId)))
    .all()
    .filter((r) => r.date.startsWith(period)) as { date: string; status: "present" | "absent" | "leave" }[];
}

export type PayrollRow = {
  staffType: "user" | "mechanic"; staffId: number; name: string; role: string;
  profitCents: number; salaryCents: number; commission: CommissionResult;
  advancesDeductedCents: number; expensesCents: number;
  attendance: AttendanceSummary; absenceDeductionCents: number;
  netCents: number; paid: boolean; payslipId: number | null;
};

export function payrollForMonth(period: string): PayrollRow[] {
  const rows: PayrollRow[] = [];

  const [y, m] = period.split("-").map(Number);

  for (const u of db.select().from(users).all()) {
    if (u.role === "owner") continue;
    const profitCents = shopkeeperProfitCents(u.id, period);
    const commission = computeCommission(profitCents, u);
    const advancesDeductedCents = advancesForMonth("user", u.id, period);
    const expensesCents = expensesForMonth("user", u.id, period);
    const attRecords = attendanceForMonth("user", u.id, period);
    const att = computeAttendanceSummary(y, m, u.salaryCents, attRecords, colomboToday());
    const existing = db.select().from(payslips).where(and(eq(payslips.staffType, "user"), eq(payslips.staffId, u.id), eq(payslips.period, period))).get();
    rows.push({
      staffType: "user", staffId: u.id, name: u.name, role: "Shopkeeper",
      profitCents, salaryCents: u.salaryCents, commission, advancesDeductedCents, expensesCents,
      attendance: att, absenceDeductionCents: att.absenceDeductionCents,
      netCents: existing ? existing.netCents : netPayCents(u.salaryCents, commission, advancesDeductedCents, expensesCents, att.absenceDeductionCents),
      paid: !!existing, payslipId: existing?.id ?? null,
    });
  }

  for (const m_row of db.select().from(mechanics).all()) {
    const profitCents = mechanicProfitCents(m_row.id, period);
    const commission = computeCommission(profitCents, m_row);
    const advancesDeductedCents = advancesForMonth("mechanic", m_row.id, period);
    const expensesCents = expensesForMonth("mechanic", m_row.id, period);
    const attRecords = attendanceForMonth("mechanic", m_row.id, period);
    const att = computeAttendanceSummary(y, m, m_row.salaryCents, attRecords, colomboToday());
    const existing = db.select().from(payslips).where(and(eq(payslips.staffType, "mechanic"), eq(payslips.staffId, m_row.id), eq(payslips.period, period))).get();
    rows.push({
      staffType: "mechanic", staffId: m_row.id, name: m_row.name, role: "Mechanic",
      profitCents, salaryCents: m_row.salaryCents, commission, advancesDeductedCents, expensesCents,
      attendance: att, absenceDeductionCents: att.absenceDeductionCents,
      netCents: existing ? existing.netCents : netPayCents(m_row.salaryCents, commission, advancesDeductedCents, expensesCents, att.absenceDeductionCents),
      paid: !!existing, payslipId: existing?.id ?? null,
    });
  }

  return rows;
}

export function payrollRowFor(staffType: "user" | "mechanic", staffId: number, period: string): PayrollRow | null {
  return payrollForMonth(period).find((r) => r.staffType === staffType && r.staffId === staffId) ?? null;
}
