import * as React from "react";
import { api } from "@/lib/api";

export type StaffType = "user" | "mechanic";
export type StaffMember = {
  staffType: StaffType; id: number; name: string;
  username?: string; canStock?: boolean; canCost?: boolean;
  salaryCents: number; commissionPct: number; monthlyTargetCents: number; targetBonusCents: number; active: boolean;
};

export type CommissionResult = { commissionCents: number; targetBonusCents: number; targetHit: boolean; targetProgressPct: number };
export type AttendanceSummary = { workingDays: number; present: number; leave: number; absent: number; allowedLeave: number; excessAbsences: number; absenceDeductionCents: number };
export type AttendanceRecord = { id: number; staffType: StaffType; staffId: number; date: string; status: "present" | "absent" | "leave"; note: string; markedBy: number; markedAt: string };
export type PayrollRow = {
  staffType: StaffType; staffId: number; name: string; role: string;
  profitCents: number; salaryCents: number; commission: CommissionResult;
  advancesDeductedCents: number; expensesCents: number;
  attendance: AttendanceSummary; absenceDeductionCents: number;
  netCents: number; paid: boolean; payslipId: number | null;
};

export type StaffExpense = {
  id: number; staffType: StaffType; staffId: number; period: string;
  category: string; amountCents: number; note: string; createdBy: number; createdAt: string;
};

export function colomboToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
}

export function defaultPayrollPeriod(): string {
  const today = colomboToday();
  const [y, m, d] = today.split("-").map(Number);
  if (d > 5) return today.slice(0, 7);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function markAttendance(staffType: StaffType, staffId: number, date: string, status: AttendanceRecord["status"] | null, note = "") {
  if (status === null) {
    return api<{ payroll?: PayrollRow; error?: string }>(`/attendance?staffType=${staffType}&staffId=${staffId}&date=${date}`, { method: "DELETE" });
  }
  return api<{ payroll?: PayrollRow; error?: string }>("/attendance", { body: { staffType, staffId, date, status, note } });
}

export function useStaff() {
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await api<{ staff: StaffMember[] }>("/staff", { method: "GET" });
    setStaff(res.ok ? res.data.staff : []);
    setLoading(false);
  }, []);

  React.useEffect(() => { reload(); }, [reload]);
  return { staff, loading, reload };
}

export function usePayroll(period: string) {
  const [rows, setRows] = React.useState<PayrollRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await api<{ rows: PayrollRow[] }>(`/payroll?period=${period}`, { method: "GET" });
    setRows(res.ok ? res.data.rows : []);
    setLoading(false);
  }, [period]);

  React.useEffect(() => { reload(); }, [reload]);
  return { rows, loading, reload };
}

export function useAttendance(staffType: StaffType, staffId: number, period: string) {
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const reload = React.useCallback(async () => {
    const res = await api<{ attendance: AttendanceRecord[] }>(`/attendance?staffType=${staffType}&staffId=${staffId}&period=${period}`, { method: "GET" });
    setRecords(res.ok ? res.data.attendance : []);
  }, [staffType, staffId, period]);
  React.useEffect(() => { reload(); }, [reload]);
  return { records, reload };
}

export function useExpenses(staffType: StaffType, staffId: number, period: string) {
  const [expenses, setExpenses] = React.useState<StaffExpense[]>([]);
  const reload = React.useCallback(async () => {
    const res = await api<{ expenses: StaffExpense[] }>(`/expenses?staffType=${staffType}&staffId=${staffId}&period=${period}`, { method: "GET" });
    setExpenses(res.ok ? res.data.expenses : []);
  }, [staffType, staffId, period]);
  React.useEffect(() => { reload(); }, [reload]);
  return { expenses, reload };
}

export type Payslip = {
  id: number; staffType: StaffType; staffId: number; period: string;
  salaryCents: number; commissionCents: number; targetBonusCents: number; advancesDeductedCents: number; netCents: number; generatedAt: string;
};

export async function fetchPayslips(staffType: StaffType, staffId: number) {
  return api<{ payslips: Payslip[] }>(`/payroll/${staffType}/${staffId}/payslips`, { method: "GET" });
}
