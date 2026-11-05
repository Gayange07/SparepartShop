import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { centsToRupees } from "@/lib/utils";
import type { Customer } from "@/lib/customers";

export function CustomerDialog({ open, onClose, onSaved, customer, isOwner }: {
  open: boolean; onClose: () => void; onSaved: () => void; customer: Customer | null; isOwner: boolean;
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [vehicleNo, setVehicleNo] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("");
  const [model, setModel] = React.useState("");
  const [nic, setNic] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [creditLimit, setCreditLimit] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr("");
    setName(customer?.name ?? ""); setPhone(customer?.phone ?? ""); setVehicleNo(customer?.vehicleNo ?? "");
    setManufacturer(customer?.manufacturer ?? ""); setModel(customer?.model ?? ""); setNic(customer?.nic ?? "");
    setAddress(customer?.address ?? ""); setCreditLimit(customer ? String(centsToRupees(customer.creditLimitCents)) : "");
  }, [open, customer]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return setErr("Enter the customer's name");
    setBusy(true);
    const payload = {
      name: name.trim(), phone: phone.trim(), vehicleNo: vehicleNo.trim(),
      manufacturer: manufacturer.trim(), model: model.trim(), nic: nic.trim(), address: address.trim(),
      creditLimitCents: Math.round((parseFloat(creditLimit) || 0) * 100),
    };
    const res = await api<{ error?: string }>(customer ? `/customers/${customer.id}` : "/customers", {
      method: customer ? "PUT" : "POST", body: payload,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save the customer");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={customer ? "Edit customer" : "Add customer"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><Label>Phone</Label><Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2 max-sm:[&>*:last-child]:col-span-2">
          <div><Label>Vehicle no</Label><Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} /></div>
          <div><Label>Manufacturer</Label><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></div>
          <div><Label>Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>NIC</Label><Input value={nic} onChange={(e) => setNic(e.target.value)} /></div>
          <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <div>
          <Label>Credit limit (Rs.) — 0 means no credit</Label>
          <Input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="decimal" disabled={!isOwner} placeholder="0.00" />
          {!isOwner && <p className="mt-1 text-xs text-muted-foreground">Owner only</p>}
        </div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
