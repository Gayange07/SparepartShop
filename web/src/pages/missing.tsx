import * as React from "react";
import { LuPlus, LuPhone, LuShare2 } from "react-icons/lu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Pills } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

type Status = "open" | "ordered" | "resolved";
type MissingPart = {
  id: number; description: string; manufacturer: string; model: string; category: string;
  customerName: string; customerPhone: string; note: string; status: Status; createdAt: string;
};

const STATUS_LABEL: Record<Status, string> = { open: "Open", ordered: "Ordered", resolved: "Closed" };
const keyOf = (m: MissingPart) => `${m.description}|${m.manufacturer}|${m.model}`.toLowerCase();
const fitText = (m: MissingPart) => [m.manufacturer, m.model].filter(Boolean).join(" ");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" });

const EMPTY = { description: "", manufacturer: "", model: "", category: "", customerName: "", customerPhone: "", note: "" };

export function MissingPartsPage({ isOwner }: { isOwner: boolean }) {
  const toast = useToast();
  const [rows, setRows] = React.useState<MissingPart[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    const res = await api<{ missingParts: MissingPart[] }>("/missing-parts", { method: "GET" });
    if (res.ok) setRows(res.data.missingParts);
    setLoading(false);
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  const open = rows.filter((m) => m.status === "open");
  const askedCount = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of open) c[keyOf(m)] = (c[keyOf(m)] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = filter === "open" ? open : [...rows].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.id - a.id);

  const save = async () => {
    if (!form.description.trim()) return toast("Describe the part");
    setBusy(true);
    const res = await api<{ error?: string }>("/missing-parts", { body: { ...form, description: form.description.trim() } });
    setBusy(false);
    if (!res.ok) return toast(res.data.error ?? "Could not save");
    toast("Saved to Missing parts list");
    setAdding(false); setForm(EMPTY); reload();
  };

  const setStatus = async (m: MissingPart, status: Status) => {
    const res = await api<{ error?: string }>(`/missing-parts/${m.id}/status`, { body: { status } });
    if (!res.ok) return toast(res.data.error ?? "Could not update");
    toast(`${m.description}: ${STATUS_LABEL[status].toLowerCase()}`);
    reload();
  };

  const shareOrderList = () => {
    const unique = new Map<string, MissingPart>();
    for (const m of open) if (!unique.has(keyOf(m))) unique.set(keyOf(m), m);
    const lines = [...unique.entries()].map(([k, m]) => `• ${m.description}${fitText(m) ? ` (${fitText(m)})` : ""}${askedCount[k] > 1 ? ` × ${askedCount[k]}` : ""}`);
    const text = `Parts we need:\n${lines.join("\n")}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const field = (k: keyof typeof EMPTY) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <h1 className="mb-1 font-cond text-[28px] font-bold leading-tight max-md:hidden">Missing parts</h1>
      <p className="mb-4 text-sm text-muted-foreground">Parts customers asked for that we didn't have. Use this list when ordering from suppliers.</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => setAdding(true)} className="max-md:flex-1"><LuPlus />Record missing part</Button>
        {isOwner && open.length > 0 && <Button variant="outline" onClick={shareOrderList} className="max-md:flex-1"><LuShare2 />Send order list</Button>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{filter === "open" ? `Still needed (${open.length})` : `All (${rows.length})`}</CardTitle>
          <Pills value={filter} onChange={setFilter} options={[{ value: "open", label: "Still needed" }, { value: "all", label: "All" }]} />
        </CardHeader>
        <CardContent className="pt-1">
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!loading && !shown.length && <p className="py-6 text-center text-sm text-muted-foreground">{filter === "open" ? "Nothing missing right now." : "No missing parts recorded yet."}</p>}
          <ul>
            {shown.map((m) => {
              const asked = m.status === "open" ? askedCount[keyOf(m)] : 0;
              return (
                <li key={m.id} className="border-b border-border-soft py-3 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold break-words">
                        {m.description}
                        {asked > 1 && <Badge variant="warning" className="ml-2">Asked {asked}×</Badge>}
                      </div>
                      <div className="text-[13px] text-muted-foreground">
                        {[fitText(m), m.category, when(m.createdAt)].filter(Boolean).join(" · ")}
                      </div>
                      {m.note && <div className="text-[13px] text-muted-foreground">{m.note}</div>}
                    </div>
                    <Badge variant={m.status === "open" ? "warning" : "success"} className="shrink-0">{STATUS_LABEL[m.status]}</Badge>
                  </div>
                  {(m.customerName || m.customerPhone) && (
                    <div className="mt-1.5 flex items-center gap-2 text-sm">
                      <span>{m.customerName || "Customer"}</span>
                      {m.customerPhone && (
                        <a href={`tel:${m.customerPhone}`} className="inline-flex min-h-10 items-center gap-1 text-primary underline-offset-2 hover:underline">
                          <LuPhone className="size-4" />{m.customerPhone}
                        </a>
                      )}
                    </div>
                  )}
                  {isOwner && m.status === "open" && (
                    <div className="mt-2 flex gap-2 [&>*]:max-md:flex-1">
                      <Button size="sm" variant="outline" onClick={() => setStatus(m, "ordered")}>Ordered</Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(m, "resolved")}>Close</Button>
                    </div>
                  )}
                  {isOwner && m.status === "ordered" && (
                    <div className="mt-2 flex gap-2 [&>*]:max-md:flex-1">
                      <Button size="sm" variant="outline" onClick={() => setStatus(m, "resolved")}>Arrived, close</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Customer wants a part we don't have"
        footer={<><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-3">
          <div><Label>Part wanted *</Label><Input {...field("description")} placeholder="e.g. Engine guard" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Manufacturer</Label><Input {...field("manufacturer")} /></div>
            <div><Label>Model</Label><Input {...field("model")} /></div>
            <div className="col-span-2"><Label>Category</Label><Input {...field("category")} /></div>
            <div><Label>Customer name</Label><Input {...field("customerName")} /></div>
            <div><Label>Phone</Label><Input type="tel" inputMode="tel" {...field("customerPhone")} /></div>
          </div>
          <div><Label>Note</Label><Input {...field("note")} placeholder="Optional" /></div>
        </div>
      </Sheet>
    </>
  );
}
