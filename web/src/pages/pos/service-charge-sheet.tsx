import * as React from "react";
import { LuWrench, LuPlus } from "react-icons/lu";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useServicePriceList, useMechanics } from "@/lib/jobs";
import { f2, cn } from "@/lib/utils";

export type ServiceCharge = { description: string; amountRupees: number; mechanicId?: number };

export function ServiceChargeSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (s: ServiceCharge) => void }) {
  const { services } = useServicePriceList();
  const mechanics = useMechanics();

  const [query, setQuery] = React.useState("");
  const [mechanicId, setMechanicId] = React.useState("");
  const [customOpen, setCustomOpen] = React.useState(false);
  const [customDesc, setCustomDesc] = React.useState("");
  const [customAmount, setCustomAmount] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setQuery(""); setMechanicId(""); setCustomOpen(false); setCustomDesc(""); setCustomAmount(""); setErr("");
  }, [open]);

  const results = query.trim()
    ? services.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : services;

  const addFromList = (name: string, priceCents: number) => {
    onAdd({ description: name, amountRupees: priceCents / 100, mechanicId: mechanicId ? Number(mechanicId) : undefined });
  };

  const addCustom = () => {
    const desc = customDesc.trim();
    const amt = parseFloat(customAmount);
    if (!desc) return setErr("Describe the charge");
    if (!amt || amt <= 0) return setErr("Enter an amount");
    onAdd({ description: desc, amountRupees: amt, mechanicId: mechanicId ? Number(mechanicId) : undefined });
    setErr(""); setCustomDesc(""); setCustomAmount(""); setCustomOpen(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add service charge" description="Pick from the price list, or add a one-off charge." footer={<Button variant="outline" onClick={onClose} className="md:ml-auto">Done</Button>}>
      <div className="space-y-4">
        <div>
          <Label>Mechanic who did the work</Label>
          <Select value={mechanicId} onChange={(e) => setMechanicId(e.target.value)}>
            <option value="">— select (optional) —</option>
            {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">Applied to every charge you add below. Needed for the mechanic's commission.</p>
        </div>

        <div>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the service price list…" />
          {!services.length && (
            <p className="py-4 text-sm text-muted-foreground">No services in the price list yet. Use "Custom charge" below, or ask the owner to add one.</p>
          )}
          {services.length > 0 && !results.length && (
            <p className="py-4 text-sm text-muted-foreground">No service matches "{query}".</p>
          )}
          {results.length > 0 && (
            <ul className="mt-2 max-h-[280px] overflow-y-auto rounded-md border border-border">
              {results.map((s) => (
                <li key={s.id} className="border-b border-border-soft last:border-0">
                  <button type="button" onClick={() => addFromList(s.name, s.priceCents)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-secondary active:scale-[.99]">
                    <span className="flex items-center gap-2.5 text-[15px]">
                      <LuWrench className="size-4 shrink-0 text-faint" />{s.name}
                    </span>
                    <span className="flex items-center gap-2 font-cond text-base font-bold tabular text-primary">
                      {f2(s.priceCents / 100)}<LuPlus className="size-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border-soft pt-3">
          <button type="button" onClick={() => setCustomOpen((v) => !v)}
            className="cursor-pointer text-sm font-medium text-primary underline underline-offset-2">
            {customOpen ? "Hide custom charge" : "+ Add a one-off charge not in the list"}
          </button>
          {customOpen && (
            <div className={cn("mt-3 space-y-3 rounded-md border border-dashed border-input p-3")}>
              <div><Label>Description *</Label><Input value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="e.g. Custom wiring job" autoFocus /></div>
              <div><Label>Amount (Rs.) *</Label><Input value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></div>
              {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
              <Button className="w-full" onClick={addCustom}><LuPlus />Add custom charge</Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
