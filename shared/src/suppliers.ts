import { z } from "zod";
import { GradeKey } from "./parts.js";

export const SupplierInput = z.object({
  name: z.string().min(1, "Supplier name is required"),
  rep: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  brands: z.string().default(""),
  termDays: z.number().int().nonnegative().default(0),
  grades: z.array(GradeKey).default([]),
  note: z.string().default(""),
});
export type SupplierInput = z.infer<typeof SupplierInput>;

export const GrnLineInput = z.object({
  partId: z.number().int().positive(),
  grade: GradeKey,
  qty: z.number().int().positive(),
  freeQty: z.number().int().nonnegative().default(0),
  unitCostCents: z.number().int().nonnegative(),
  newSellPriceCents: z.number().int().positive().optional(),
  supplierPartNo: z.string().default(""),
});
export type GrnLineInput = z.infer<typeof GrnLineInput>;

export const GrnInput = z.object({
  supplierId: z.number().int().positive(),
  theirBillNo: z.string().default(""),
  billDate: z.string().min(1),
  discountCents: z.number().int().nonnegative().default(0),
  lines: z.array(GrnLineInput).min(1, "Add at least one item"),
  paidNowCents: z.number().int().nonnegative().default(0),
  paymentMethod: z.enum(["cash", "card", "cheque", "bank_transfer"]).default("cash"),
  chequeNo: z.string().default(""),
  chequeDate: z.string().optional(),
});
export type GrnInput = z.infer<typeof GrnInput>;

export const SupplierPaymentInput = z.object({
  amountCents: z.number().int().positive("Enter the amount"),
  method: z.enum(["cash", "card", "cheque", "bank_transfer"]).default("cash"),
  chequeNo: z.string().default(""),
  chequeDate: z.string().optional(),
  note: z.string().default(""),
}).refine((v) => v.method !== "cheque" || (v.chequeNo.trim() && v.chequeDate), { message: "Enter the cheque number and date" });
export type SupplierPaymentInput = z.infer<typeof SupplierPaymentInput>;

export const SupplierReturnInput = z.object({
  partId: z.number().int().positive(),
  grade: GradeKey,
  qty: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative(),
  reason: z.string().min(1, "Enter a reason"),
});
export type SupplierReturnInput = z.infer<typeof SupplierReturnInput>;
