import * as React from "react";
import { GRADES, type GradeKey } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Checkbox } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/suppliers";

export function SupplierDialog({ open, onClose, onSaved, supplier }: {
  open: boolean; onClose: () => void; onSaved: () => void; supplier: Supplier | null;
}) {
  const [name, setName] = React.useState("");
  const [rep, setRep] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [brands, setBrands] = React.useState("");
  const [termDays, setTermDays] = React.useState("0");
  const [grades, setGrades] = React.useState<GradeKey[]>([]);
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr("");
    setName(supplier?.name ?? ""); setRep(supplier?.rep ?? ""); setPhone(supplier?.phone ?? "");
    setAddress(supplier?.address ?? ""); setBrands(supplier?.brands ?? "");
    setTermDays(String(supplier?.termDays ?? 0)); setGrades(supplier?.grades ?? []); setNote(supplier?.note ?? "");
  }, [open, supplier]);

  if (!open) return null;

  const toggleGrade = (g: GradeKey) => setGrades((gs) => gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]);

  const submit = async () => {
    if (!name.trim()) return setErr("Enter the supplier's company name");
    setBusy(true);
    const payload = {
      name: name.trim(), rep: rep.trim(), phone: phone.trim(), address: address.trim(),
      brands: brands.trim(), termDays: Math.max(0, parseInt(termDays, 10) || 0), grades, note: note.trim(),
    };
    const res = await api<{ error?: string }>(supplier ? `/suppliers/${supplier.id}` : "/suppliers", {
      method: supplier ? "PUT" : "POST", body: payload,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save the supplier");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={supplier ? "Edit supplier" : "Add supplier"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Company name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><Label>Rep name</Label><Input value={rep} onChange={(e) => setRep(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Phone / WhatsApp</Label><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <div><Label>Brands supplied</Label><Input value={brands} onChange={(e) => setBrands(e.target.value)} placeholder="e.g. Bajaj, TVS genuine parts" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Credit days (0 = cash)</Label><Input value={termDays} onChange={(e) => setTermDays(e.target.value)} inputMode="numeric" /></div>
          <div>
            <Label>Grades supplied</Label>
            <div className="flex h-9 items-center gap-3 max-md:h-11">
              {GRADES.map((g) => <Checkbox key={g.key} label={g.label} checked={grades.includes(g.key)} onChange={() => toggleGrade(g.key)} />)}
            </div>
          </div>
        </div>
        <div><Label>Notes</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
