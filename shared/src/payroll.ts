import { z } from "zod";

export const StaffType = z.enum(["user", "mechanic"]);
export type StaffType = z.infer<typeof StaffType>;

export const AdvanceInput = z.object({
  staffType: StaffType,
  staffId: z.number().int().positive(),
  amountCents: z.number().int().positive("Enter the amount"),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Pick a month"),
  note: z.string().default(""),
});
export type AdvanceInput = z.infer<typeof AdvanceInput>;

export const EXPENSE_CATEGORIES = ["Food & meals", "Transport", "Uniform", "Tools", "Medical", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const ExpenseInput = z.object({
  staffType: StaffType,
  staffId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Pick a month"),
  category: z.enum(EXPENSE_CATEGORIES),
  amountCents: z.number().int().positive("Enter the amount"),
  note: z.string().default(""),
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;

export const AttendanceStatus = z.enum(["present", "absent", "leave"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

/** A real calendar date as YYYY-MM-DD (rejects 2026-02-30, 2026-13-01). */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const MarkAttendanceInput = z.object({
  staffType: StaffType,
  staffId: z.number().int().positive(),
  date: z.string()
    .refine(isCalendarDate, "Pick a date")
    .refine((s) => new Date(s + "T00:00:00Z").getUTCDay() !== 0, "Sunday — the shop is closed, no attendance needed"),
  status: AttendanceStatus,
  note: z.string().default(""),
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInput>;

/** Monthly leave allowance: 1 Saturday + 3 weekdays = 4 days */
export const MONTHLY_LEAVE_ALLOWANCE = { saturdays: 1, weekdays: 3 };

/**
 * Working days in a month = all Mon–Sat (Sundays are always off, shop closed).
 * We count Mon=1 … Sat=6, skip Sun=0.
 */
export function workingDaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate(); // total days
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun
    if (dow !== 0) count++;
  }
  return count;
}

/** Saturdays in month */
function saturdaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() === 6) count++;
  }
  return count;
}

export type AttendanceSummary = {
  workingDays: number; present: number; leave: number; absent: number;
  allowedLeave: number; excessAbsences: number; absenceDeductionCents: number;
};

/**
 * Given attendance records for the month, compute deduction.
 * Policy: 1 Saturday + 3 weekdays off allowed free.
 * Excess absences (leave + absent beyond allowance) → salary deduction.
 */
export function computeAttendanceSummary(
  year: number, month: number, salaryCents: number,
  records: { date: string; status: "present" | "absent" | "leave" }[],
  /** YYYY-MM-DD; unmarked working days after this are not counted as present yet */
  today?: string,
): AttendanceSummary {
  const workingDays = workingDaysInMonth(year, month);
  const satCount = saturdaysInMonth(year, month);

  let present = 0, leave = 0, absent = 0;
  let leaveSat = 0, leaveWeekday = 0;
  let absentSat = 0, absentWeekday = 0;

  for (const r of records) {
    const dow = new Date(r.date + "T00:00:00").getDay();
    if (dow === 0) continue; // Sunday — not a working day
    if (r.status === "present") { present++; }
    else if (r.status === "leave") {
      leave++;
      if (dow === 6) leaveSat++; else leaveWeekday++;
    } else {
      absent++;
      if (dow === 6) absentSat++; else absentWeekday++;
    }
  }

  // Implicit present = working days up to today with no record marked
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const marked = new Set(records.map((r) => r.date));
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const date = `${period}-${String(d).padStart(2, "0")}`;
    if (today && date > today) break;
    if (new Date(year, month - 1, d).getDay() !== 0 && !marked.has(date)) present++;
  }

  // Allowance: 1 Saturday off + 3 weekday offs (leave or absent both consume allowance)
  const totalSatOff = leaveSat + absentSat;
  const totalWeekdayOff = leaveWeekday + absentWeekday;
  const usedSatAllowance = Math.min(totalSatOff, MONTHLY_LEAVE_ALLOWANCE.saturdays);
  const usedWeekdayAllowance = Math.min(totalWeekdayOff, MONTHLY_LEAVE_ALLOWANCE.weekdays);
  const allowedLeave = usedSatAllowance + usedWeekdayAllowance;

  // Extra saturdays off beyond 1: charged
  const excessSat = Math.max(0, totalSatOff - MONTHLY_LEAVE_ALLOWANCE.saturdays);
  // But unused sat allowance can roll into weekday pool? No — keep separate per policy.
  // Unused saturday allowance does NOT carry to weekdays.
  const excessWeekday = Math.max(0, totalWeekdayOff - MONTHLY_LEAVE_ALLOWANCE.weekdays);
  const excessAbsences = excessSat + excessWeekday;

  const dailyRateCents = workingDays > 0 ? Math.round(salaryCents / workingDays) : 0;
  const absenceDeductionCents = excessAbsences * dailyRateCents;

  return { workingDays, present, leave, absent, allowedLeave, excessAbsences, absenceDeductionCents };
}

export const GeneratePayslipInput = z.object({
  staffType: StaffType,
  staffId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Pick a month"),
});
export type GeneratePayslipInput = z.infer<typeof GeneratePayslipInput>;

export type CommissionResult = { commissionCents: number; targetBonusCents: number; targetHit: boolean; targetProgressPct: number };

/** Commission is a % of profit (never negative profit), plus a flat bonus if the monthly profit target is hit. */
export function computeCommission(
  profitCents: number,
  settings: { commissionPct: number; monthlyTargetCents: number; targetBonusCents: number },
): CommissionResult {
  const commissionCents = Math.round(Math.max(0, profitCents) * settings.commissionPct / 100);
  const targetHit = settings.monthlyTargetCents > 0 && profitCents >= settings.monthlyTargetCents;
  const targetBonusCents = targetHit ? settings.targetBonusCents : 0;
  const targetProgressPct = settings.monthlyTargetCents > 0
    ? (targetHit ? 100 : Math.min(99, Math.floor(Math.max(0, profitCents) / settings.monthlyTargetCents * 100)))
    : 0;
  return { commissionCents, targetBonusCents, targetHit, targetProgressPct };
}

export function netPayCents(salaryCents: number, commission: CommissionResult, advancesDeductedCents: number, expensesCents = 0, absenceDeductionCents = 0): number {
  return salaryCents + commission.commissionCents + commission.targetBonusCents + expensesCents - advancesDeductedCents - absenceDeductionCents;
}
