import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Checkbox, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { centsToRupees } from "@/lib/utils";
import type { StaffMember, StaffType } from "@/lib/staff";

export function StaffDialog({ open, onClose, onSaved, staff }: {
  open: boolean; onClose: () => void; onSaved: () => void; staff: StaffMember | null;
}) {
  const [staffType, setStaffType] = React.useState<StaffType>("mechanic");
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [canStock, setCanStock] = React.useState(false);
  const [canCost, setCanCost] = React.useState(false);
  const [salary, setSalary] = React.useState("");
  const [commissionPct, setCommissionPct] = React.useState("0");
  const [target, setTarget] = React.useState("");
  const [targetBonus, setTargetBonus] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr(""); setPassword("");
    setStaffType(staff?.staffType ?? "mechanic");
    setName(staff?.name ?? ""); setUsername(staff?.username ?? "");
    setCanStock(staff?.canStock ?? false); setCanCost(staff?.canCost ?? false);
    setSalary(staff ? String(centsToRupees(staff.salaryCents)) : "");
    setCommissionPct(staff ? String(staff.commissionPct) : "0");
    setTarget(staff && staff.monthlyTargetCents > 0 ? String(centsToRupees(staff.monthlyTargetCents)) : "");
    setTargetBonus(staff && staff.targetBonusCents > 0 ? String(centsToRupees(staff.targetBonusCents)) : "");
    setActive(staff?.active ?? true);
  }, [open, staff]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return setErr("Enter their name");
    if (staffType === "user" && !username.trim()) return setErr("Enter a username");
    if (staffType === "user" && !staff && !password) return setErr("Set a login password");
    setBusy(true);
    const common = {
      name: name.trim(),
      salaryCents: Math.round((parseFloat(salary) || 0) * 100),
      commissionPct: Math.max(0, Math.min(100, parseInt(commissionPct, 10) || 0)),
      monthlyTargetCents: Math.round((parseFloat(target) || 0) * 100),
      targetBonusCents: Math.round((parseFloat(targetBonus) || 0) * 100),
      active,
    };
    const res = staffType === "user"
      ? await api<{ error?: string }>(staff ? `/staff/users/${staff.id}` : "/staff/users", {
        method: staff ? "PUT" : "POST",
        body: { ...common, username: username.trim(), password: password || undefined, canStock, canCost },
      })
      : await api<{ error?: string }>(staff ? `/staff/mechanics/${staff.id}` : "/staff/mechanics", {
        method: staff ? "PUT" : "POST", body: common,
      });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={staff ? `Edit ${staff.name}` : "Add staff member"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
      <div className="space-y-3">
        {!staff && (
          <div>
            <Label>Type</Label>
            <Select value={staffType} onChange={(e) => setStaffType(e.target.value as StaffType)}>
              <option value="mechanic">Mechanic (no login)</option>
              <option value="user">Shopkeeper (has a login)</option>
            </Select>
          </div>
        )}
        <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>

        {staffType === "user" && (
          <>
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              <div><Label>Username *</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" /></div>
              <div><Label>{staff ? "New password (leave blank to keep)" : "Login password *"}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Checkbox label="Can manage stock" checked={canStock} onChange={(e) => setCanStock(e.target.checked)} />
              <Checkbox label="Can see cost prices" checked={canCost} onChange={(e) => setCanCost(e.target.checked)} />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div><Label>Monthly salary (Rs.)</Label><Input value={salary} onChange={(e) => setSalary(e.target.value)} inputMode="decimal" placeholder="0.00" /></div>
          <div><Label>Commission % of profit</Label><Input value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} inputMode="numeric" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Monthly profit target (Rs.)</Label><Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="optional" /></div>
          <div><Label>Bonus if target hit (Rs.)</Label><Input value={targetBonus} onChange={(e) => setTargetBonus(e.target.value)} inputMode="decimal" placeholder="optional" /></div>
        </div>
        <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
