import { describe, expect, it } from "vitest";
import { computeCommission, netPayCents, computeAttendanceSummary, workingDaysInMonth, isCalendarDate, MarkAttendanceInput } from "./payroll.js";

describe("attendance dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isCalendarDate("2026-11-05")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-45")).toBe(false);
    expect(isCalendarDate("5/11/2026")).toBe(false);
  });

  it("refuses attendance on a Sunday and allows a future weekday for planned leave", () => {
    const base = { staffType: "user" as const, staffId: 1, status: "leave" as const };
    expect(MarkAttendanceInput.safeParse({ ...base, date: "2026-11-08" }).success).toBe(false);
    expect(MarkAttendanceInput.safeParse({ ...base, date: "2026-12-02" }).success).toBe(true);
  });
});

// November 2026: starts on a Sunday; 5 Sundays, 4 Saturdays (7, 14, 21, 28), 25 working days.
const SALARY = 4500000; // Rs 45,000 → daily rate Rs 1,800
const nov = (d: number) => `2026-11-${String(d).padStart(2, "0")}`;

describe("computeAttendanceSummary", () => {
  it("counts Monday to Saturday as working days", () => {
    expect(workingDaysInMonth(2026, 11)).toBe(25);
  });

  it("treats unmarked working days as present, with no deduction", () => {
    const r = computeAttendanceSummary(2026, 11, SALARY, []);
    expect(r.present).toBe(25);
    expect(r.absenceDeductionCents).toBe(0);
  });

  it("only counts unmarked days up to today as present", () => {
    expect(computeAttendanceSummary(2026, 11, SALARY, [], nov(5)).present).toBe(4);
  });

  it("allows 1 Saturday and 3 weekdays off for free", () => {
    const r = computeAttendanceSummary(2026, 11, SALARY, [
      { date: nov(7), status: "leave" }, { date: nov(2), status: "leave" },
      { date: nov(3), status: "absent" }, { date: nov(4), status: "leave" },
    ]);
    expect(r.allowedLeave).toBe(4);
    expect(r.excessAbsences).toBe(0);
    expect(r.absenceDeductionCents).toBe(0);
  });

  it("deducts a second Saturday off at the daily rate, even with weekday allowance unused", () => {
    const r = computeAttendanceSummary(2026, 11, SALARY, [{ date: nov(7), status: "leave" }, { date: nov(14), status: "absent" }]);
    expect(r.excessAbsences).toBe(1);
    expect(r.absenceDeductionCents).toBe(180000);
  });

  it("deducts a fourth weekday off", () => {
    const r = computeAttendanceSummary(2026, 11, SALARY, [2, 3, 4, 5].map((d) => ({ date: nov(d), status: "leave" as const })));
    expect(r.excessAbsences).toBe(1);
    expect(r.absenceDeductionCents).toBe(180000);
  });

  it("ignores records on a Sunday", () => {
    const r = computeAttendanceSummary(2026, 11, SALARY, [{ date: nov(8), status: "absent" }]);
    expect(r.absent).toBe(0);
    expect(r.present).toBe(25);
  });
});

describe("computeCommission", () => {
  it("pays a percentage of profit, no bonus if no target is set", () => {
    const r = computeCommission(1000000, { commissionPct: 10, monthlyTargetCents: 0, targetBonusCents: 5000 });
    expect(r.commissionCents).toBe(100000);
    expect(r.targetHit).toBe(false);
    expect(r.targetBonusCents).toBe(0);
  });

  it("never pays commission on negative profit", () => {
    const r = computeCommission(-50000, { commissionPct: 10, monthlyTargetCents: 0, targetBonusCents: 0 });
    expect(r.commissionCents).toBe(0);
  });

  it("pays the full flat bonus once profit reaches the target, nothing below it", () => {
    const below = computeCommission(99999, { commissionPct: 0, monthlyTargetCents: 100000, targetBonusCents: 20000 });
    expect(below.targetHit).toBe(false);
    expect(below.targetBonusCents).toBe(0);
    expect(below.targetProgressPct).toBe(99); // capped below 100 while not yet hit

    const atTarget = computeCommission(100000, { commissionPct: 0, monthlyTargetCents: 100000, targetBonusCents: 20000 });
    expect(atTarget.targetHit).toBe(true);
    expect(atTarget.targetBonusCents).toBe(20000);
  });

  it("caps target progress at 100% even when profit exceeds the target", () => {
    const r = computeCommission(500000, { commissionPct: 0, monthlyTargetCents: 100000, targetBonusCents: 20000 });
    expect(r.targetProgressPct).toBe(100);
  });
});

describe("netPayCents", () => {
  it("adds salary, commission, and bonus, then subtracts advances", () => {
    const commission = computeCommission(1000000, { commissionPct: 10, monthlyTargetCents: 1000000, targetBonusCents: 5000 });
    const net = netPayCents(3000000, commission, 50000);
    expect(net).toBe(3000000 + 100000 + 5000 - 50000);
  });
});
