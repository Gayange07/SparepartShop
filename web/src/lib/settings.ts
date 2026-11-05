import * as React from "react";
import type { BillSettings } from "shared";
import { api } from "@/lib/api";

type SettingsResponse = {
  maxDiscountPct: number; autoDiscountOverCents: number; autoDiscountPct: number;
  roundToCents: number; roundDirection: "down" | "nearest"; taxPct: number;
  shopName: string; shopAddress: string; shopPhone: string; receiptFooter: string;
};

export function useSettings() {
  const [settings, setSettings] = React.useState<SettingsResponse | null>(null);

  React.useEffect(() => {
    api<{ settings: SettingsResponse }>("/settings", { method: "GET" }).then((r) => r.ok && setSettings(r.data.settings));
  }, []);

  const billSettings: BillSettings | null = settings && {
    maxDiscountPct: settings.maxDiscountPct,
    autoDiscountOverCents: settings.autoDiscountOverCents,
    autoDiscountPct: settings.autoDiscountPct,
    roundToCents: settings.roundToCents,
    roundDirection: settings.roundDirection,
    taxPct: settings.taxPct,
  };

  return { settings, billSettings };
}
