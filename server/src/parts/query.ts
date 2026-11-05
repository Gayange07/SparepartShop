import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { parts, partGrades, partSupplierNumbers, users } from "../db/schema/index.js";
import type { GradeKey } from "shared";

export type PartRow = {
  id: number;
  partNo: string;
  name: string;
  manufacturer: string;
  category: string;
  vehicleType: string;
  rack: string;
  models: string[];
  priceEstimated: boolean | null;
  updatedAt: string;
  updatedByName: string | null;
  grades: Partial<Record<GradeKey, { cost?: number; price: number | null; qty: number; reorder: number }>>;
  supplierNumbers: { supplierId: number; supplierPartNo: string }[];
};

/** Loads every part with its grades, optionally including cost prices. */
export function listParts(includeCost: boolean): PartRow[] {
  const partRows = db.select({
    id: parts.id, partNo: parts.partNo, name: parts.name, manufacturer: parts.manufacturer,
    category: parts.category, vehicleType: parts.vehicleType, rack: parts.rack, models: parts.models,
    priceEstimated: parts.priceEstimated,
    updatedAt: parts.updatedAt, updatedByName: users.name,
  }).from(parts).leftJoin(users, eq(parts.updatedBy, users.id)).all();

  const gradeRows = db.select().from(partGrades).all();
  const supplierRows = db.select().from(partSupplierNumbers).all();

  return partRows.map((p): PartRow => {
    const grades: PartRow["grades"] = {};
    for (const g of gradeRows.filter((g) => g.partId === p.id)) {
      grades[g.grade] = includeCost
        ? { cost: g.costCents, price: g.priceCents, qty: g.qty, reorder: g.reorderLevel }
        : { price: g.priceCents, qty: g.qty, reorder: g.reorderLevel };
    }
    return {
      ...p,
      supplierNumbers: supplierRows.filter((s) => s.partId === p.id).map((s) => ({ supplierId: s.supplierId, supplierPartNo: s.supplierPartNo })),
      grades,
    };
  });
}

export function getPartById(id: number, includeCost: boolean): PartRow | null {
  return listParts(includeCost).find((p) => p.id === id) ?? null;
}
