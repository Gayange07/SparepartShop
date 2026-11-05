import * as React from "react";
import type { GradeKey } from "shared";
import { api } from "@/lib/api";
import { centsToRupees } from "@/lib/utils";

export type GradeStock = { price: number; cost?: number; qty: number; reorder: number };
export type Part = {
  id: number;
  partNo: string;
  name: string;
  manufacturer: string;
  models: string[];
  category: string;
  vehicleType: string;
  rack: string;
  priceEstimated: boolean | null;
  grades: Partial<Record<GradeKey, GradeStock>>;
  updatedByName: string | null;
  supplierNumbers: { supplierId: number; supplierPartNo: string }[];
};

type ApiPart = {
  id: number; partNo: string; name: string; manufacturer: string; category: string;
  vehicleType: string; rack: string; models: string[]; priceEstimated: boolean | null;
  updatedByName: string | null;
  grades: Partial<Record<GradeKey, { cost?: number; price: number | null; qty: number; reorder: number }>>;
  supplierNumbers: { supplierId: number; supplierPartNo: string }[];
};

function toPart(p: ApiPart): Part {
  const grades: Part["grades"] = {};
  for (const key of ["GEN", "AA", "A"] as GradeKey[]) {
    const g = p.grades[key];
    if (!g || g.price === null) continue;
    grades[key] = {
      price: centsToRupees(g.price),
      cost: g.cost !== undefined ? centsToRupees(g.cost) : undefined,
      qty: g.qty,
      reorder: g.reorder,
    };
  }
  return { ...p, grades };
}

export function useParts() {
  const [parts, setParts] = React.useState<Part[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await api<{ parts: ApiPart[] }>("/parts", { method: "GET" });
    setParts(res.ok ? res.data.parts.map(toPart) : []);
    setLoading(false);
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  return { parts, loading, reload };
}

export const isLow = (g?: GradeStock) => !!g && g.qty <= g.reorder;
export const LOW_STOCK_FLAG = "inventory:lowOnly";

/** Existing manufacturers, categories and models, for pick-or-type dropdowns on the part form and inventory filters. */
export function usePartFacets() {
  const [manufacturers, setManufacturers] = React.useState<string[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [models, setModels] = React.useState<string[]>([]);

  const reload = React.useCallback(async () => {
    const [m, c, mo] = await Promise.all([
      api<{ manufacturers: string[] }>("/parts/manufacturers", { method: "GET" }),
      api<{ categories: string[] }>("/parts/categories", { method: "GET" }),
      api<{ models: string[] }>("/parts/models", { method: "GET" }),
    ]);
    if (m.ok) setManufacturers(m.data.manufacturers);
    if (c.ok) setCategories(c.data.categories);
    if (mo.ok) setModels(mo.data.models);
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  return { manufacturers, categories, models, reload };
}
