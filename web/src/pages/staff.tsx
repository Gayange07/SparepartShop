import * as React from "react";
import { LuPlus, LuReceipt, LuCalendarDays, LuEllipsis, LuPencil, LuHandCoins } from "react-icons/lu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  useStaff, usePayroll, markAttendance, colomboToday, defaultPayrollPeriod,
  type StaffMember, type PayrollRow, type AttendanceRecord,
} from "@/lib/staff";
import { StaffDialog } from "@/pages/staff/staff-dialog";
import { AdvanceSheet } from "@/pages/staff/advance-sheet";
import { ExpenseSheet } from "@/pages/staff/expense-sheet";
import { AttendanceSheet } from "@/pages/staff/attendance-sheet";
import { api } from "@/lib/api";
import { cn, rs, centsToRupees } from "@/lib/utils";

type Status = AttendanceRecord["status"];
const STATUS_OPTS: { value: Status; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "border-gen/40 bg-gen-soft text-gen" },
  { value: "absent", label: "Absent", on: "border-destructive/40 bg-destructive-soft text-destructive" },
  { value: "leave", label: "Leave", on: "border-warning/40 bg-warning-soft text-warning" },
];

function TodayAttendance({ staff, onChanged }: { staff: StaffMember[]; onChanged: () => void }) {
  const toast = useToast();
  const today = colomboToday();
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const res = await api<{ attendance: AttendanceRecord[] }>(`/attendance?period=${today.slice(0, 7)}`, { method: "GET" });
    setRecords(res.ok ? res.data.attendance.filter((r) => r.date === today) : []);
  }, [today]);
  React.useEffect(() => { reload(); }, [reload]);

  const active = staff.filter((s) => s.active);
  const isSunday = new Date(today + "T00:00:00").getDay() === 0;
  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });

  const mark = async (s: StaffMember, status: Status) => {
    const key = `${s.staffType}-${s.id}`;
    setBusyKey(key);
    const res = await markAttendance(s.staffType, s.id, today, status);
    setBusyKey(null);
    if (!res.ok) return toast(res.data.error ?? "Could not save attendance");
    await reload();
    onChanged();
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Today's attendance</CardTitle>
        <span className="text-[13px] text-muted-foreground">{dateLabel}</span>
      </CardHeader>
      <CardContent className="pt-1">
        {isSunday ? (
          <p className="py-2 text-sm text-muted-foreground">Sunday, shop closed. Nothing to mark today.</p>
        ) : !active.length ? (
          <p className="py-2 text-sm text-muted-foreground">No active staff yet.</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {active.map((s) => {
              const key = `${s.staffType}-${s.id}`;
              const current = records.find((r) => r.staffType === s.staffType && r.staffId === s.id)?.status;
              return (
                <li key={key} className="flex items-center gap-3 py-2.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{s.name}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {s.staffType === "user" ? "Shopkeeper" : "Mechanic"}
                      {" · "}
                      {current ? STATUS_OPTS.find((o) => o.value === current)!.label : "Not marked yet"}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:w-[270px]" role="group" aria-label={`Attendance for ${s.name}`}>
                    {STATUS_OPTS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        disabled={busyKey === key}
                        aria-pressed={current === o.value}
                        onClick={() => mark(s, o.value)}
                        className={cn(
                          "min-h-11 cursor-pointer rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60",
                          current === o.value ? o.on : "border-border bg-secondary text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function StaffPage() {
  const { staff, loading, reload } = useStaff();
  const [period, setPeriod] = React.useState(defaultPayrollPeriod);
  const { rows, loading: payrollLoading, reload: reloadPayroll } = usePayroll(period);
  const toast = useToast();

  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<StaffMember | null>(null);
  const [advancingFor, setAdvancingFor] = React.useState<StaffMember | null>(null);
  const [expensesFor, setExpensesFor] = React.useState<StaffMember | null>(null);
  const [attendanceFor, setAttendanceFor] = React.useState<StaffMember | null>(null);
  const [moreFor, setMoreFor] = React.useState<StaffMember | null>(null);

  const pay = async (row: PayrollRow) => {
    const notOver = period >= colomboToday().slice(0, 7);
    const msg = `Pay ${row.name} ${rs(centsToRupees(row.netCents))} for ${period}?`
      + (notOver ? `\n\nWarning: ${period} is not over yet. Attendance and commission may still change.` : "");
    if (!window.confirm(msg)) return;
    const res = await api<{ error?: string }>(`/payroll/${row.staffType}/${row.staffId}/pay`, { method: "POST", body: { period } });
    if (!res.ok) return toast(res.data.error ?? "Could not pay");
    toast(`${row.name} paid ${rs(centsToRupees(row.netCents))} for ${period}`);
    reloadPayroll();
  };

  const staffForMember = (row: PayrollRow): StaffMember | null =>
    staff.find((s) => s.staffType === row.staffType && s.id === row.staffId) ?? null;

  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:mb-3 max-md:hidden">Staff &amp; payroll</h1>

      <TodayAttendance staff={staff} onChanged={reloadPayroll} />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <Button size="sm" onClick={() => setAdding(true)}><LuPlus />Add staff</Button>
        </CardHeader>
        <CardContent className="pt-1">
          <DataTable
            rowKey={(s) => `${s.staffType}-${s.id}`}
            rows={staff}
            empty={loading ? "Loading…" : "No staff yet."}
            columns={[
              {
                key: "name", header: "Name", primary: true,
                cell: (s) => <>{s.name}{!s.active && <Badge variant="default" className="ml-2">Inactive</Badge>}</>,
              },
              { key: "role", header: "Role", cell: (s) => s.staffType === "user" ? "Shopkeeper" : "Mechanic" },
              { key: "login", header: "Login", cell: (s) => s.username ?? "No login" },
              { key: "salary", header: "Salary", align: "right" as const, cell: (s) => rs(centsToRupees(s.salaryCents)) },
              {
                key: "comm", header: "Commission", align: "right" as const, cell: (s) => (
                  <>
                    {s.commissionPct > 0 ? `${s.commissionPct}% of profit` : "—"}
                    {s.monthlyTargetCents > 0 && (
                      <div className="text-[12.5px] text-muted-foreground">
                        + {rs(centsToRupees(s.targetBonusCents))} if ≥ {rs(centsToRupees(s.monthlyTargetCents))}
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: "a", header: "", actions: true, cell: (s: StaffMember) => (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setAttendanceFor(s)}><LuCalendarDays />Attendance</Button>
                    <Button size="sm" variant="outline" onClick={() => setExpensesFor(s)}><LuReceipt />Expenses</Button>
                    <Button size="sm" variant="outline" onClick={() => setMoreFor(s)} aria-label={`More for ${s.name}`}><LuEllipsis />More</Button>
                  </>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payroll</CardTitle>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Payroll month" className="w-[160px] max-md:w-full" />
        </CardHeader>
        <CardContent className="pt-1">
          <DataTable
            rowKey={(r) => `${r.staffType}-${r.staffId}`}
            rows={rows}
            empty={payrollLoading ? "Loading…" : "No staff yet."}
            columns={[
              { key: "name", header: "Name", primary: true, cell: (r) => r.name },
              { key: "role", header: "Role", cell: (r) => r.role },
              { key: "profit", header: "Profit made", align: "right" as const, cell: (r) => rs(centsToRupees(r.profitCents)) },
              { key: "salary", header: "Salary", align: "right" as const, cell: (r) => rs(centsToRupees(r.salaryCents)) },
              { key: "comm", header: "Commission", align: "right" as const, cell: (r) => rs(centsToRupees(r.commission.commissionCents)) },
              {
                key: "bonus", header: "Target bonus", align: "right" as const, cell: (r) => r.commission.targetHit
                  ? rs(centsToRupees(r.commission.targetBonusCents))
                  : r.commission.targetProgressPct > 0 ? `${r.commission.targetProgressPct}% of target` : "—",
              },
              {
                key: "exp", header: "Expenses", align: "right" as const,
                cell: (r: PayrollRow) => (
                  <button
                    onClick={() => { const s = staffForMember(r); if (s) setExpensesFor(s); }}
                    className="-my-2 min-h-11 cursor-pointer font-cond font-bold tabular text-warning hover:underline"
                  >
                    {r.expensesCents > 0 ? `+ ${rs(centsToRupees(r.expensesCents))}` : <span className="font-normal text-primary underline">Add expense</span>}
                  </button>
                ),
              },
              {
                key: "att", header: "Attendance", align: "right" as const,
                cell: (r: PayrollRow) => {
                  const att = r.attendance;
                  const s = staffForMember(r);
                  return (
                    <button onClick={() => { if (s) setAttendanceFor(s); }} className="-my-2 min-h-11 cursor-pointer text-right hover:underline">
                      <span className="font-medium text-gen">{att.present} present</span>
                      {" · "}
                      <span className={att.absent > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{att.absent} absent</span>
                      {" · "}
                      <span className="font-medium text-warning">{att.leave} leave</span>
                    </button>
                  );
                },
              },
              {
                key: "absded", header: "Absence deduction", align: "right" as const,
                cell: (r) => r.absenceDeductionCents > 0
                  ? <span className="font-medium text-destructive">− {rs(centsToRupees(r.absenceDeductionCents))}</span>
                  : <span className="text-muted-foreground">—</span>,
              },
              { key: "adv", header: "Advances", align: "right" as const, cell: (r) => r.advancesDeductedCents > 0 ? `− ${rs(centsToRupees(r.advancesDeductedCents))}` : "—" },
              { key: "net", header: "Net pay", align: "right" as const, cell: (r) => <b>{rs(centsToRupees(r.netCents))}</b> },
              {
                key: "a", header: "", actions: true, cell: (r: PayrollRow) => (
                  r.paid
                    ? <Badge variant="success">Paid</Badge>
                    : <Button size="sm" onClick={() => pay(r)}>Pay</Button>
                ),
              },
            ]}
          />
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Net pay = salary + commission + target bonus + expenses − absence deduction − advances.
            Free days off: <b className="text-foreground">1 Saturday + 3 weekdays</b> each month. Extra days off are taken off at the daily rate.
          </p>
        </CardContent>
      </Card>

      <Sheet open={!!moreFor} onClose={() => setMoreFor(null)} title={moreFor?.name ?? ""}
        footer={<Button variant="outline" onClick={() => setMoreFor(null)}>Close</Button>}>
        <div className="grid gap-2">
          <Button variant="outline" size="lg" className="justify-start" onClick={() => { setEditing(moreFor); setMoreFor(null); }}><LuPencil />Edit details and salary</Button>
          <Button variant="outline" size="lg" className="justify-start" onClick={() => { setAdvancingFor(moreFor); setMoreFor(null); }}><LuHandCoins />Give salary advance</Button>
        </div>
      </Sheet>

      <StaffDialog open={adding} onClose={() => setAdding(false)} staff={null}
        onSaved={() => { setAdding(false); toast("Staff member added"); reload(); reloadPayroll(); }} />
      <StaffDialog open={!!editing} onClose={() => setEditing(null)} staff={editing}
        onSaved={() => { setEditing(null); toast("Staff member updated"); reload(); reloadPayroll(); }} />
      <AdvanceSheet open={!!advancingFor} onClose={() => setAdvancingFor(null)} staff={advancingFor} period={period}
        onSaved={() => { setAdvancingFor(null); toast("Advance recorded"); reloadPayroll(); }} />
      <ExpenseSheet open={!!expensesFor} onClose={() => setExpensesFor(null)} staff={expensesFor} period={period}
        onChanged={() => reloadPayroll()} />
      <AttendanceSheet
        open={!!attendanceFor}
        onClose={() => setAttendanceFor(null)}
        staff={attendanceFor}
        period={period}
        payrollRow={attendanceFor ? rows.find((r) => r.staffType === attendanceFor.staffType && r.staffId === attendanceFor.id) ?? null : null}
        onChanged={() => reloadPayroll()}
      />
    </>
  );
}
