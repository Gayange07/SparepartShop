import * as React from "react";
import { GRADES, gradeLabel, type GradeKey, type PartInput, type SupplierInput } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { usePartFacets, type Part } from "@/lib/parts";

type GradeForm = { cost: string; price: string; qty: string; reorder: string };
const emptyGrade: GradeForm = { cost: "", price: "", qty: "", reorder: "5" };

export function PartDialog({ open, onClose, onSaved, part, owner, canCost }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  part: Part | null; owner: boolean; canCost: boolean;
}) {
  const { manufacturers, categories, models: modelSuggestions } = usePartFacets();
  const [form, setForm] = React.useState({ partNo: "", name: "", manufacturer: "", category: "", vehicleType: "Motorcycle", rack: "" });
  const [models, setModels] = React.useState<string[]>([]);
  const [modelDraft, setModelDraft] = React.useState("");
  const [grades, setGrades] = React.useState<Record<GradeKey, GradeForm>>({ GEN: emptyGrade, AA: emptyGrade, A: emptyGrade });
  const [suppliers, setSuppliers] = React.useState<{ id: number; name: string }[]>([]);
  const [supplierNumbers, setSupplierNumbers] = React.useState<{ supplierId: string; supplierPartNo: string }[]>([]);
  const [newSupplierName, setNewSupplierName] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr("");
    setModelDraft("");
    if (part) {
      setForm({ partNo: part.partNo, name: part.name, manufacturer: part.manufacturer, category: part.category, vehicleType: part.vehicleType, rack: part.rack });
      setModels(part.models);
      const g: Record<GradeKey, GradeForm> = { GEN: emptyGrade, AA: emptyGrade, A: emptyGrade };
      for (const key of ["GEN", "AA", "A"] as GradeKey[]) {
        const existing = part.grades[key];
        g[key] = existing
          ? { cost: existing.cost !== undefined ? String(existing.cost) : "", price: String(existing.price), qty: String(existing.qty), reorder: String(existing.reorder) }
          : emptyGrade;
      }
      setGrades(g);
      setSupplierNumbers(part.supplierNumbers.map((s) => ({ supplierId: String(s.supplierId), supplierPartNo: s.supplierPartNo })));
    } else {
      setForm({ partNo: "", name: "", manufacturer: "", category: "", vehicleType: "Motorcycle", rack: "" });
      setModels([]);
      setGrades({ GEN: emptyGrade, AA: emptyGrade, A: emptyGrade });
      setSupplierNumbers([]);
    }
    if (owner) api<{ suppliers: { id: number; name: string }[] }>("/suppliers", { method: "GET" }).then((r) => r.ok && setSuppliers(r.data.suppliers));
  }, [open, part, owner]);

  const addSupplier = async () => {
    if (!newSupplierName.trim()) return;
    const payload: SupplierInput = { name: newSupplierName.trim(), rep: "", phone: "", address: "", brands: "", termDays: 0, grades: [], note: "" };
    const res = await api<{ supplier: { id: number; name: string } }>("/suppliers", { body: payload });
    if (res.ok) {
      setSuppliers((s) => [...s, res.data.supplier]);
      setNewSupplierName("");
    }
  };

  // Add a model tag, deduping case-insensitively against what's already chosen.
  const addModel = (raw: string) => {
    const m = raw.trim();
    if (!m) return;
    setModels((ms) => (ms.some((x) => x.toLowerCase() === m.toLowerCase()) ? ms : [...ms, m]));
    setModelDraft("");
  };
  const removeModel = (i: number) => setModels((ms) => ms.filter((_, j) => j !== i));
  const onModelKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addModel(modelDraft); }
    else if (e.key === "Backspace" && !modelDraft && models.length) removeModel(models.length - 1);
  };
  // Suggestions not already chosen.
  const modelOptions = modelSuggestions.filter((s) => !models.some((m) => m.toLowerCase() === s.toLowerCase()));

  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);
  const remove = async () => {
    if (!part) return;
    if (!confirmDelete) { setConfirmDelete(true); return setErr(`Tap "Yes, delete" to delete ${part.partNo} ${part.name}. Old bills still keep its name.`); }
    setDeleting(true);
    const res = await api<{ error?: string }>(`/parts/${part.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not delete");
    onSaved();
  };

  const submit = async () => {
    if (!form.partNo.trim() || !form.name.trim() || !form.manufacturer.trim() || !form.category.trim()) {
      return setErr("Part number, name, manufacturer and category are required");
    }
    setBusy(true);
    // Fold any un-committed model draft into the list so it isn't lost when saving.
    const draft = modelDraft.trim();
    const finalModels = draft && !models.some((m) => m.toLowerCase() === draft.toLowerCase()) ? [...models, draft] : models;
    const payload: PartInput = {
      partNo: form.partNo.trim(), name: form.name.trim(), manufacturer: form.manufacturer.trim(),
      category: form.category.trim(), vehicleType: form.vehicleType as PartInput["vehicleType"],
      rack: form.rack.trim(), models: finalModels,
      grades: {
        GEN: { price: grades.GEN.price === "" ? null : Math.round(Number(grades.GEN.price) * 100), cost: grades.GEN.cost === "" ? undefined : Math.round(Number(grades.GEN.cost) * 100), reorder: Number(grades.GEN.reorder) || 5, qty: part ? undefined : Number(grades.GEN.qty) || 0 },
        AA: { price: grades.AA.price === "" ? null : Math.round(Number(grades.AA.price) * 100), cost: grades.AA.cost === "" ? undefined : Math.round(Number(grades.AA.cost) * 100), reorder: Number(grades.AA.reorder) || 5, qty: part ? undefined : Number(grades.AA.qty) || 0 },
        A: { price: grades.A.price === "" ? null : Math.round(Number(grades.A.price) * 100), cost: grades.A.cost === "" ? undefined : Math.round(Number(grades.A.cost) * 100), reorder: Number(grades.A.reorder) || 5, qty: part ? undefined : Number(grades.A.qty) || 0 },
      },
      supplierNumbers: supplierNumbers.filter((s) => s.supplierId && s.supplierPartNo.trim()).map((s) => ({ supplierId: Number(s.supplierId), supplierPartNo: s.supplierPartNo.trim() })),
    };
    const res = await api<{ error?: string }>(part ? `/parts/${part.id}` : "/parts", { method: part ? "PUT" : "POST", body: payload });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={part ? "Edit part" : "Add new part"}
      footer={<>
        {part && owner && <Button variant="outline" className="mr-auto text-destructive hover:bg-destructive-soft" onClick={remove} disabled={deleting}>{deleting ? "Deleting…" : confirmDelete ? "Yes, delete" : "Delete"}</Button>}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[170px_1fr] gap-2 max-md:grid-cols-1">
          <div><Label>Our part number *</Label><Input value={form.partNo} onChange={(e) => setForm({ ...form, partNo: e.target.value })} /></div>
          <div><Label>Part name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Engine guard" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Manufacturer *</Label>
            <Input list="mfr-list" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="Pick or type a new one" autoComplete="off" />
            <datalist id="mfr-list">{manufacturers.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div><Label>Rack / bin</Label><Input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} /></div>
        </div>

        <div>
          <Label>Fits models</Label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-accent">
            {models.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[13px] font-medium">
                {m}
                <button type="button" aria-label={`Remove ${m}`} onClick={() => removeModel(i)} className="-mr-1 grid size-6 cursor-pointer place-items-center rounded text-faint hover:bg-destructive-soft hover:text-destructive">✕</button>
              </span>
            ))}
            <input
              list="model-list"
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              onKeyDown={onModelKey}
              onBlur={() => addModel(modelDraft)}
              placeholder={models.length ? "Add another…" : "Pick or type a model, Enter to add"}
              autoComplete="off"
              className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-faint max-md:text-base"
            />
            <datalist id="model-list">{modelOptions.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Pick from existing models or type a new one. Press Enter or comma to add each.</p>
        </div>

        <div className="grid grid-cols-[1fr_160px] gap-2 max-md:grid-cols-1">
          <div>
            <Label>Category *</Label>
            <Input list="cat-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Pick or type a new one" autoComplete="off" />
            <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div><Label>Vehicle type</Label><Select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}><option>Motorcycle</option><option>Three-wheeler</option><option>Both</option></Select></div>
        </div>

        <h3 className="mt-4 font-cond text-lg font-bold">Grades &amp; prices</h3>
        <p className="-mt-2 text-xs text-muted-foreground">Leave the selling price empty for a grade you don't sell.{canCost ? "" : " Cost prices are hidden — only the owner or staff allowed can see them."}</p>
        <div className="space-y-2">
          {GRADES.map((g) => {
            const set = (k: keyof GradeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
              setGrades((s) => ({ ...s, [g.key]: { ...s[g.key], [k]: e.target.value } }));
            const notCarried = grades[g.key].price === "";
            return (
              <div key={g.key} className="rounded-lg border border-border-soft p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{gradeLabel(g.key)}</span>
                  {notCarried && <span className="text-[12.5px] text-muted-foreground">Not carried</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {canCost && <div className="min-w-0"><Label>Cost price</Label><Input inputMode="decimal" value={grades[g.key].cost} onChange={set("cost")} /></div>}
                  <div className="min-w-0"><Label>Selling price</Label><Input inputMode="decimal" value={grades[g.key].price} onChange={set("price")} placeholder="Not sold" /></div>
                  <div className="min-w-0">
                    <Label>{part ? "Qty in stock" : "Qty in stock now"}</Label>
                    {part
                      ? <p className="flex h-9 items-center text-sm text-muted-foreground max-md:h-11">{part.grades[g.key]?.qty ?? 0} <span className="ml-1 text-xs">(change in Stock)</span></p>
                      : <Input inputMode="numeric" value={grades[g.key].qty} onChange={set("qty")} />}
                  </div>
                  <div className="min-w-0"><Label>Reorder at</Label><Input inputMode="numeric" value={grades[g.key].reorder} onChange={set("reorder")} /></div>
                </div>
              </div>
            );
          })}
        </div>
        {owner && (
          <>
            <h3 className="mt-4 font-cond text-lg font-bold">Supplier part numbers</h3>
            <p className="-mt-2 text-xs text-muted-foreground">Each supplier's own number for this part. When receiving stock, typing their number finds this part.</p>
            {supplierNumbers.map((sn, i) => (
              <div key={i} className="flex gap-2 max-md:flex-wrap">
                <Select value={sn.supplierId} onChange={(e) => setSupplierNumbers((s) => s.map((x, j) => j === i ? { ...x, supplierId: e.target.value } : x))} className="flex-1">
                  <option value="">— supplier —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Input value={sn.supplierPartNo} onChange={(e) => setSupplierNumbers((s) => s.map((x, j) => j === i ? { ...x, supplierPartNo: e.target.value } : x))} placeholder="their part no" className="flex-1 max-md:basis-[calc(100%-52px)]" />
                <Button variant="outline" size="icon" aria-label="Remove supplier number" onClick={() => setSupplierNumbers((s) => s.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSupplierNumbers((s) => [...s, { supplierId: "", supplierPartNo: "" }])}>+ Add supplier number</Button>
            <div className="flex gap-2 pt-1">
              <Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="New supplier name" className="flex-1" />
              <Button variant="outline" size="sm" onClick={addSupplier}>Add supplier</Button>
            </div>
          </>
        )}

        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
