import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const CSV_HEADER = "part_no,name,manufacturer,models,category,vehicle,location,genuine_cost,genuine_price,genuine_qty,aa_cost,aa_price,aa_qty,a_cost,a_price,a_qty";
const CSV_SAMPLE = "BR-001,Brake shoe rear,Bajaj,\"CT100, Discover 125\",Brakes,Motorcycle,A1,850,1200,10,450,700,15,300,500,20";

function downloadTemplate() {
  const blob = new Blob([CSV_HEADER + "\n" + CSV_SAMPLE + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "parts-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [result, setResult] = React.useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setResult(null); setErr(""); } }, [open]);

  const onFile = async (file: File) => {
    setBusy(true);
    setErr("");
    const text = await file.text();
    const res = await api<{ added?: number; updated?: number; skipped?: number; error?: string }>("/parts/import", { body: { csv: text } });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not import");
    setResult({ added: res.data.added ?? 0, updated: res.data.updated ?? 0, skipped: res.data.skipped ?? 0 });
    onImported();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Import parts from Excel"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-3 text-sm">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Download the template and open it in Excel.</li>
          <li>One row per part. Leave price empty for grades you don't sell.</li>
          <li>Excel: File → Save As → CSV (Comma delimited).</li>
          <li>Choose the file below.</li>
        </ol>
        <p className="text-muted-foreground">Existing part numbers are updated and quantities are <b>added</b> to stock.</p>
        <Button variant="outline" onClick={downloadTemplate}>Download template</Button>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          className="block text-sm"
        />
        {busy && <p className="text-muted-foreground">Importing…</p>}
        {err && <p role="alert" className="font-medium text-destructive">{err}</p>}
        {result && (
          <p className="rounded-md bg-accent px-3 py-2">
            Done: <b>{result.added}</b> new, <b>{result.updated}</b> updated{result.skipped ? `, ${result.skipped} skipped` : ""}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
