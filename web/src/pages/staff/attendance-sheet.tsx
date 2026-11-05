import * as React from "react";
import { MONTHLY_LEAVE_ALLOWANCE } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn, rs, centsToRupees } from "@/lib/utils";
import { useAttendance, markAttendance, colomboToday, type StaffMember, type PayrollRow, type AttendanceRecord } from "@/lib/staff";

type Status = "present" | "absent" | "leave";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MARK: Record<Status, string> = { present: "✓", absent: "✗", leave: "L" };
const WORD: Record<Status, string> = { present: "Present", absent: "Absent", leave: "Leave" };

function buildGrid(period: string): (string | null)[] {
  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${period}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const dow = (date: string) => new Date(date + "T00:00:00").getDay();
const statusText = (s: Status) => s === "present" ? "text-gen" : s === "absent" ? "text-destructive" : "text-warning";

function DayCell({ date, record, onSelect, selected, today }: {
  date: string; record: AttendanceRecord | undefined;
  onSelect: (date: string | null) => void; selected: boolean; today: boolean;
}) {
  const day = Number(date.slice(8));
  if (dow(date) === 0) {
    return (
      <div className="flex min-h-[52px] flex-col items-center justify-center rounded-lg border border-border-soft bg-muted/40 p-1">
        <span className="text-[13px] font-bold text-muted-foreground/50">{day}</span>
        <span className="text-[11px] text-muted-foreground/60">Off</span>
      </div>
    );
  }
  const sat = dow(date) === 6;
  const status = record?.status as Status | undefined;
  const bg =
    status === "present" ? "bg-gen-soft border-gen/25"
    : status === "absent" ? "bg-destructive-soft border-destructive/25"
    : status === "leave" ? "bg-warning-soft border-warning/25"
    : sat ? "bg-primary/[0.04] border-primary/15"
    : "bg-card border-border";

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : date)}
      aria-label={`${date}${status ? `, ${WORD[status]}` : ""}`}
      className={cn(
        "relative flex min-h-[52px] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border p-1 transition-all",
        bg,
        today && "border-2 border-primary",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
    >
      <span className={cn("font-cond text-[14px] font-bold leading-none", status ? statusText(status) : today ? "text-primary" : "text-foreground", today && "underline underline-offset-2")}>{day}</span>
      {status ? (
        <span className={cn("text-[13px] font-bold leading-none", statusText(status))}>
          <span className="md:hidden">{MARK[status]}</span>
          <span className="hidden text-[11px] md:inline">{WORD[status]}</span>
        </span>
      ) : (
        <span className="text-[11px] leading-none">&nbsp;</span>
      )}
      {record?.note && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary/50" />}
    </button>
  );
}

function DayDetail({ date, record, onMark, onClose, busy }: {
  date: string; record: AttendanceRecord | undefined;
  onMark: (date: string, status: Status | null, note?: string) => void;
  onClose: () => void; busy: boolean;
}) {
  const [note, setNote] = React.useState(record?.note ?? "");
  const ref = React.useRef<HTMLDivElement>(null);
  const status = record?.status as Status | undefined;

  React.useEffect(() => { setNote(record?.note ?? ""); }, [record?.note]);
  React.useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [date]);

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div ref={ref} className="space-y-3 rounded-xl border border-primary/30 bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{dateLabel}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["present", "absent", "leave"] as Status[]).map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => onMark(date, s, note)}
            className={cn(
              "min-h-11 cursor-pointer rounded-lg border text-sm font-semibold transition-all",
              status === s
                ? s === "present" ? "border-gen/40 bg-gen-soft text-gen"
                  : s === "absent" ? "border-destructive/40 bg-destructive-soft text-destructive"
                  : "border-warning/40 bg-warning-soft text-warning"
                : "border-border bg-secondary text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            {MARK[s]} {WORD[s]}
          </button>
        ))}
      </div>

      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. sick day, wedding" />

      {status && (
        <div className="flex flex-wrap gap-2">
          {note !== (record?.note ?? "") && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onMark(date, status, note)}>Save note</Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMark(date, null)} className="text-destructive">Clear this day</Button>
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean; onClose: () => void;
  staff: StaffMember | null; period: string;
  payrollRow: PayrollRow | null;
  onChanged: (updated?: PayrollRow) => void;
};

export function AttendanceSheet({ open, onClose, staff, period, payrollRow, onChanged }: Props) {
  const toast = useToast();
  const { records, reload } = useAttendance(staff?.staffType ?? "user", staff?.id ?? 0, period);
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { reload(); setSelected(null); } }, [open, reload]);

  if (!staff) return null;

  const today = colomboToday();
  const grid = buildGrid(period);
  const recordMap = Object.fromEntries(records.map((r) => [r.date, r]));

  const mark = async (date: string, status: Status | null, note = "") => {
    setBusy(true);
    const res = await markAttendance(staff.staffType, staff.id, date, status, note);
    setBusy(false);
    if (!res.ok) return toast(res.data.error ?? "Could not save attendance");
    onChanged(res.data.payroll);
    await reload();
  };

  const att = payrollRow?.attendance;
  const salaryCents = payrollRow?.salaryCents ?? 0;
  const dailyRate = att && att.workingDays > 0 ? Math.round(salaryCents / att.workingDays) : 0;

  const rows: (string | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) rows.push(grid.slice(i, i + 7));

  const [y, m] = period.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
  const marked = records.filter((r) => r.status !== "present").sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Sheet open={open} onClose={onClose} title={`Attendance: ${staff.name}`} description={monthLabel}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-secondary p-3">
          {[
            { n: att?.present ?? 0, label: "Present", cls: "text-gen" },
            { n: att?.leave ?? 0, label: "Leave", cls: "text-warning" },
            { n: att?.absent ?? 0, label: "Absent", cls: (att?.absent ?? 0) > 0 ? "text-destructive" : "text-foreground" },
            { n: `${att?.allowedLeave ?? 0}/${MONTHLY_LEAVE_ALLOWANCE.saturdays + MONTHLY_LEAVE_ALLOWANCE.weekdays}`, label: "Free days used", cls: (att?.excessAbsences ?? 0) > 0 ? "text-destructive" : "text-gen" },
          ].map((s) => (
            <div key={s.label} className="min-w-0 text-center">
              <div className={cn("font-cond text-[22px] font-bold leading-tight", s.cls)}>{s.n}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <p className="rounded-lg bg-secondary px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Free each month: <b className="text-foreground">1 Saturday</b> and <b className="text-foreground">3 weekdays</b>.
          Extra days off cost <b className="text-foreground">{rs(centsToRupees(dailyRate))}</b> each.
          Tap a day to mark it. You can mark future days for planned leave.
        </p>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span><b className="text-gen">✓</b> Present</span>
          <span><b className="text-destructive">✗</b> Absent</span>
          <span><b className="text-warning">L</b> Leave</span>
          <span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-primary/50" />Has a note</span>
          <span className="text-primary underline underline-offset-2">Today</span>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-7 gap-1">
            {DOW_LABELS.map((d) => (
              <div key={d} className={cn("py-0.5 text-center text-[11px] font-semibold",
                d === "Sat" ? "text-primary" : d === "Sun" ? "text-muted-foreground/50" : "text-muted-foreground")}>{d}</div>
            ))}
          </div>
          {rows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7 gap-1">
              {row.map((date, ci) => date === null
                ? <div key={ci} className="min-h-[52px]" />
                : <DayCell key={date} date={date} record={recordMap[date]} onSelect={setSelected} selected={selected === date} today={date === today} />)}
            </div>
          ))}
        </div>

        {selected && (
          <DayDetail date={selected} record={recordMap[selected]} onMark={mark} onClose={() => setSelected(null)} busy={busy} />
        )}

        {marked.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="bg-secondary px-3.5 py-2 text-[13px] font-semibold text-muted-foreground">Days off this month</div>
            <ul className="divide-y divide-border-soft">
              {marked.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.date)} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-secondary">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{new Date(r.date + "T00:00:00").toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}</div>
                      {r.note && <div className="text-[12px] break-words text-muted-foreground">{r.note}</div>}
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold",
                      r.status === "absent" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning")}>
                      {WORD[r.status as Status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {att && att.excessAbsences > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive-soft px-3.5 py-3 text-sm text-destructive">
            <b>{att.excessAbsences} day{att.excessAbsences > 1 ? "s" : ""}</b> over the free days, so <b>{rs(centsToRupees(att.absenceDeductionCents))}</b> comes off this month's salary.
          </div>
        )}
      </div>
    </Sheet>
  );
}
