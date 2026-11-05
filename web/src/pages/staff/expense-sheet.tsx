import * as React from "react";
import { LuTrash2 } from "react-icons/lu";
import { EXPENSE_CATEGORIES } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { rs, centsToRupees } from "@/lib/utils";
import { useExpenses, type StaffMember, type PayrollRow } from "@/lib/staff";

type Props = {
  open: boolean; onClose: () => void;
  staff: StaffMember | null; period: string;
  onChanged: (updatedRow: PayrollRow) => void;
};

export function ExpenseSheet({ open, onClose, staff, period, onChanged }: Props) {
  const { expenses, reload } = useExpenses(
    staff?.staffType ?? "user",
    staff?.id ?? 0,
    period,
  );

  const [category, setCategory] = React.useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setCategory(EXPENSE_CATEGORIES[0]); setAmount(""); setNote(""); setErr(""); reload(); }
  }, [open, reload]);

  if (!staff) return null;

  const submit = async () => {
    const amtRs = parseFloat(amount);
    if (!amount || isNaN(amtRs) || amtRs <= 0) return setErr("Enter a valid amount");
    setBusy(true);
    const res = await api<{ expense?: unknown; payroll?: PayrollRow; error?: string }>("/expenses", {
      body: {
        staffType: staff.staffType, staffId: staff.id, period,
        category, amountCents: Math.round(amtRs * 100), note: note.trim(),
      },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save expense");
    if (res.data.payroll) onChanged(res.data.payroll);
    setAmount(""); setNote(""); setErr("");
    reload();
  };

  const remove = async (id: number) => {
    const res = await api<{ ok?: boolean; payroll?: PayrollRow; error?: string }>(`/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) return setErr(res.data.error ?? "Could not remove expense");
    if (res.data.payroll) onChanged(res.data.payroll);
    reload();
  };

  const total = expenses.reduce((s, e) => s + e.amountCents, 0);

  return (
    <Sheet open={open} onClose={onClose} title={`Expenses — ${staff.name} (${period})`}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">

        {/* existing expenses */}
        {expenses.length > 0 ? (
          <ul className="divide-y divide-border-soft rounded-xl border border-border">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium text-sm">{e.category}</span>
                  {e.note && <span className="ml-2 text-sm text-muted-foreground">{e.note}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="font-cond font-bold tabular text-sm">{rs(centsToRupees(e.amountCents))}</span>
                  <button onClick={() => remove(e.id)} aria-label={`Remove ${e.category} expense`} className="-mr-2 grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive">
                    <LuTrash2 className="size-[18px]" />
                  </button>
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between px-3.5 py-2.5 bg-secondary">
              <span className="text-sm font-medium">Total expenses</span>
              <span className="font-cond font-bold tabular">{rs(centsToRupees(total))}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No expenses recorded for this month yet.</p>
        )}

        {/* add new */}
        <div className="rounded-xl border border-border p-3.5 space-y-3">
          <p className="text-[13px] font-semibold text-muted-foreground">Add expense</p>
          <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
            <div>
              <Label>Category *</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label>Amount (Rs.) *</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" autoFocus />
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rice and curry — lunch" />
          </div>
          {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
          <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Saving…" : "Add expense"}</Button>
        </div>
      </div>
    </Sheet>
  );
}
