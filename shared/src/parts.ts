import { z } from "zod";

export const GradeKey = z.enum(["GEN", "AA", "A"]);
export type GradeKey = z.infer<typeof GradeKey>;

export const GRADES: { key: GradeKey; label: string }[] = [
  { key: "GEN", label: "Genuine" },
  { key: "AA", label: "AA Grade" },
  { key: "A", label: "A Grade" },
];
export const gradeLabel = (k: GradeKey) => GRADES.find((g) => g.key === k)!.label;

export const VehicleType = z.enum(["Motorcycle", "Three-wheeler", "Both"]);

export const PartGradeInput = z.object({
  cost: z.number().int().nonnegative().optional(),
  price: z.number().int().nonnegative().nullable(),
  reorder: z.number().int().nonnegative().default(5),
  qty: z.number().int().nonnegative().optional(),
});
export type PartGradeInput = z.infer<typeof PartGradeInput>;

export const SupplierNumberInput = z.object({
  supplierId: z.number().int().positive(),
  supplierPartNo: z.string().min(1),
});

export const PartInput = z.object({
  partNo: z.string().min(1, "Our part number is required"),
  name: z.string().min(1, "Part name is required"),
  manufacturer: z.string().min(1, "Manufacturer is required"),
  category: z.string().min(1, "Category is required"),
  vehicleType: VehicleType,
  rack: z.string().default(""),
  models: z.array(z.string()).default([]),
  grades: z.object({
    GEN: PartGradeInput.optional(),
    AA: PartGradeInput.optional(),
    A: PartGradeInput.optional(),
  }),
  supplierNumbers: z.array(SupplierNumberInput).default([]),
});
export type PartInput = z.infer<typeof PartInput>;

export const StockMovementInput = z.object({
  grade: GradeKey,
  action: z.enum(["in", "out", "set"]),
  qty: z.number().int().nonnegative(),
  note: z.string().trim().min(1, "Give a reason for the stock change"),
});
export type StockMovementInput = z.infer<typeof StockMovementInput>;

/** Computes the signed qty change to apply, and rejects it if stock would go below zero. */
export function computeStockDelta(currentQty: number, input: StockMovementInput): { delta: number; error?: string } {
  if (input.action !== "set" && input.qty === 0) return { delta: 0, error: "Enter a quantity" };
  const delta = input.action === "in" ? input.qty : input.action === "out" ? -input.qty : input.qty - currentQty;
  if (currentQty + delta < 0) return { delta, error: "Stock cannot go below zero" };
  return { delta };
}

export const isLow = (g?: { qty: number; reorder: number } | null) => !!g && g.qty <= g.reorder;
