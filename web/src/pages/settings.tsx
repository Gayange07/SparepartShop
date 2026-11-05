import * as React from "react";
import { LuSave, LuKeyRound, LuDownload } from "react-icons/lu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { centsToRupees } from "@/lib/utils";

type BackupRow = { name: string; sizeBytes: number; createdAt: string };
function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type SettingsRow = {
  shopName: string; shopAddress: string; shopPhone: string; receiptFooter: string;
  maxDiscountPct: number; autoDiscountOverCents: number; autoDiscountPct: number;
  roundToCents: number; roundDirection: "down" | "nearest"; taxPct: number;
};

export function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = React.useState<SettingsRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // Backups list.
  const [backups, setBackups] = React.useState<BackupRow[]>([]);
  const reloadBackups = React.useCallback(() => {
    api<{ backups: BackupRow[] }>("/backup/list", { method: "GET" }).then((r) => r.ok && setBackups(r.data.backups));
  }, []);
  React.useEffect(() => { reloadBackups(); }, [reloadBackups]);

  // Owner-password change form (separate submit).
  const [currentPw, setCurrentPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [newPw2, setNewPw2] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwErr, setPwErr] = React.useState("");

  React.useEffect(() => {
    api<{ settings: SettingsRow }>("/settings", { method: "GET" }).then((r) => r.ok && setForm(r.data.settings));
  }, []);

  if (!form) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  const update = (patch: Partial<SettingsRow>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    setBusy(true); setErr("");
    const res = await api<{ error?: string; settings?: SettingsRow }>("/settings", { method: "PUT", body: form });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save settings");
    toast("Settings saved");
    if (res.data.settings) setForm(res.data.settings);
  };

  const savePassword = async () => {
    setPwErr("");
    if (!currentPw) return setPwErr("Enter the current authorization password");
    if (newPw.length < 4) return setPwErr("New password must be at least 4 characters");
    if (newPw !== newPw2) return setPwErr("New passwords do not match");
    setPwBusy(true);
    const res = await api<{ error?: string }>("/settings/owner-password", { method: "POST", body: { currentPassword: currentPw, newPassword: newPw } });
    setPwBusy(false);
    if (!res.ok) return setPwErr(res.data.error ?? "Could not change the password");
    toast("Owner authorization password changed");
    setCurrentPw(""); setNewPw(""); setNewPw2("");
  };

  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:mb-3 max-md:hidden">Settings</h1>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Shop details</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Shop name *</Label><Input value={form.shopName} onChange={(e) => update({ shopName: e.target.value })} /></div>
            <div><Label>Phone</Label><Input type="tel" inputMode="tel" value={form.shopPhone} onChange={(e) => update({ shopPhone: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={form.shopAddress} onChange={(e) => update({ shopAddress: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Receipt footer</Label><Input value={form.receiptFooter} onChange={(e) => update({ receiptFooter: e.target.value })} placeholder="e.g. Thanks for your business! No returns on electrical parts." /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Billing rules</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Max discount staff can give (%)</Label>
              <Input inputMode="numeric" value={String(form.maxDiscountPct)} onChange={(e) => update({ maxDiscountPct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })} />
              <p className="mt-1 text-xs text-muted-foreground">Owner has no limit.</p>
            </div>
            <div>
              <Label>Big-bill auto discount (%)</Label>
              <Input inputMode="numeric" value={String(form.autoDiscountPct)} onChange={(e) => update({ autoDiscountPct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Apply auto discount when bill is at least (Rs.)</Label>
              <Input inputMode="decimal" value={String(centsToRupees(form.autoDiscountOverCents))} onChange={(e) => update({ autoDiscountOverCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} />
            </div>
            <div>
              <Label>Round off step (Rs.)</Label>
              <Input inputMode="decimal" value={String(centsToRupees(form.roundToCents))} onChange={(e) => update({ roundToCents: Math.max(1, Math.round((parseFloat(e.target.value) || 0) * 100)) })} />
            </div>
            <div>
              <Label>Round direction</Label>
              <Select value={form.roundDirection} onChange={(e) => update({ roundDirection: e.target.value as "down" | "nearest" })}>
                <option value="down">Down</option>
                <option value="nearest">Nearest</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Tax (%)</Label>
              <Input inputMode="numeric" value={String(form.taxPct)} onChange={(e) => update({ taxPct: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })} />
              <p className="mt-1 text-xs text-muted-foreground">Set to 0 if the shop is not registered for VAT.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 max-md:sticky max-md:bottom-[calc(66px+env(safe-area-inset-bottom))] max-md:z-20 max-md:-mx-3.5 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-3.5 max-md:py-2.5 max-md:backdrop-blur">
          {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
          <Button onClick={save} disabled={busy} className="max-md:w-full"><LuSave />{busy ? "Saving…" : "Save all settings"}</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Owner authorization password</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Needed to approve credit sales, void bills, and other sensitive actions. Different from your login password.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>Current</Label><Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
              <div><Label>New</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
              <div><Label>Confirm new</Label><Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} /></div>
            </div>
            {pwErr && <p role="alert" className="text-sm font-medium text-destructive">{pwErr}</p>}
            <div className="flex justify-end"><Button variant="outline" onClick={savePassword} disabled={pwBusy}><LuKeyRound />{pwBusy ? "Changing…" : "Change password"}</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Backups</CardTitle>
            <a href="/api/backup" download onClick={() => setTimeout(reloadBackups, 1500)} className={buttonVariants({ size: "sm" })}>
              <LuDownload />Backup now
            </a>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">A nightly backup runs automatically at 2 AM and keeps the last 7 days in <code className="rounded bg-secondary px-1 py-0.5 text-[12px]">server/backups/</code>. The "Backup now" button downloads a fresh copy straight to your Downloads folder.</p>
            <p className="text-[12.5px] text-muted-foreground">Copy a backup file to a USB drive or your Google Drive from the counter PC. Scheduled uploads to those services are planned for the go-live step.</p>
            <div className="pt-1">
              <h3 className="mb-2 font-cond text-base font-bold">Recent backups</h3>
              <DataTable rowKey={(b) => b.name} rows={backups} empty={`No backups yet. Click "Backup now" to make one.`} columns={[
                { key: "name", header: "File", primary: true, cell: (b) => <span className="break-all">{b.name}</span> },
                { key: "size", header: "Size", align: "right" as const, cell: (b) => humanSize(b.sizeBytes) },
                { key: "when", header: "Taken", cell: (b) => new Date(b.createdAt).toLocaleString() },
              ]} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
