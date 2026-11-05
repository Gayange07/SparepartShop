import { z } from "zod";
import { GradeKey } from "./parts.js";

export const SaleLineInput = z.object({
  partId: z.number().int().positive(),
  grade: GradeKey,
  qty: z.number().int().positive(),
});
export type SaleLineInput = z.infer<typeof SaleLineInput>;

export const SaleServiceInput = z.object({
  description: z.string().min(1),
  amount: z.number().int().nonnegative(),
  mechanicId: z.number().int().positive().optional(),
});
export type SaleServiceInput = z.infer<typeof SaleServiceInput>;

export const SaleReturnLineInput = z.object({
  saleId: z.number().int().positive(),
  partId: z.number().int().positive(),
  grade: GradeKey,
  qty: z.number().int().positive(),
  reason: z.string().default(""),
});
export type SaleReturnLineInput = z.infer<typeof SaleReturnLineInput>;

export const SaleInput = z.object({
  lines: z.array(SaleLineInput).default([]),
  services: z.array(SaleServiceInput).default([]),
  returns: z.array(SaleReturnLineInput).default([]),
  applyRefundToCredit: z.boolean().default(false),
  customerId: z.number().int().positive().optional(),
  customerName: z.string().default(""),
  customerPhone: z.string().default(""),
  vehicleNo: z.string().default(""),
  mechanicId: z.number().int().positive().optional(),
  jobId: z.number().int().positive().optional(),
  preOrderId: z.number().int().positive().optional(),
  discountPct: z.number().nonnegative().default(0),
  autoDiscountAccepted: z.boolean().default(true),
  roundOff: z.boolean().default(false),
  paymentMethod: z.enum(["cash", "card", "credit"]),
  cashReceivedCents: z.number().int().nonnegative().optional(),
  creditPaidNowCents: z.number().int().nonnegative().default(0),
  ownerAuthPassword: z.string().optional(),
}).refine((v) => v.lines.length > 0 || v.services.length > 0 || v.returns.length > 0, { message: "Add at least one item to the bill" });
export type SaleInput = z.infer<typeof SaleInput>;

export const VoidSaleInput = z.object({
  reason: z.string().min(1, "Enter a reason"),
  ownerAuthPassword: z.string().min(1, "Owner authorization password is required"),
});
export type VoidSaleInput = z.infer<typeof VoidSaleInput>;

export type BillSettings = {
  maxDiscountPct: number;
  autoDiscountOverCents: number;
  autoDiscountPct: number;
  roundToCents: number;
  roundDirection: "down" | "nearest";
  taxPct: number;
};

export type LinePrice = { partId: number; grade: string; qty: number; unitPriceCents: number };

/**
 * The one true bill-math function — used by both the POS page (for live preview) and the
 * server (for the authoritative total). Never trust a client-computed total.
 */
export function computeBillTotals(
  lineTotalsCents: number,
  serviceTotalsCents: number,
  settings: BillSettings,
  options: { discountPct: number; autoDiscountAccepted: boolean; roundOff: boolean; isOwner: boolean; advanceDeductedCents?: number; returnCreditCents?: number },
) {
  const subtotalCents = lineTotalsCents + serviceTotalsCents;
  const autoEligible = settings.autoDiscountPct > 0 && subtotalCents >= settings.autoDiscountOverCents;
  const autoDiscountApplied = autoEligible && options.autoDiscountAccepted;

  const manualDiscountPct = Math.max(0, options.discountPct);
  let discountPct = autoDiscountApplied ? Math.max(settings.autoDiscountPct, options.isOwner ? manualDiscountPct : 0) : manualDiscountPct;
  let discountCapped = false;
  if (!options.isOwner && discountPct > settings.maxDiscountPct && discountPct !== settings.autoDiscountPct) {
    discountPct = settings.maxDiscountPct;
    discountCapped = true;
  }

  const discountCents = Math.round((subtotalCents * discountPct) / 100);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round((taxableCents * settings.taxPct) / 100);
  const rawTotalCents = taxableCents + taxCents;

  let totalCents = rawTotalCents;
  if (options.roundOff) {
    const step = settings.roundToCents || 1000;
    totalCents = settings.roundDirection === "nearest"
      ? Math.round(rawTotalCents / step) * step
      : Math.floor(rawTotalCents / step) * step;
  }
  const roundOffCents = totalCents - rawTotalCents;

  const advanceCredit = Math.max(0, options.advanceDeductedCents ?? 0);
  const returnCredit = Math.max(0, options.returnCreditCents ?? 0);
  // Advance never pays "back" to the customer — it's deposited money for this bill.
  // Return credit can; when total credits exceed the total, the shop owes cash back.
  const advanceDeductedCents = Math.min(advanceCredit, totalCents);
  const creditAppliedCents = Math.min(advanceCredit + returnCredit, totalCents);
  const dueCents = totalCents - creditAppliedCents;
  const refundOutCents = Math.max(0, advanceCredit + returnCredit - totalCents);

  return {
    subtotalCents, autoEligible, autoDiscountApplied, discountPct, discountCapped, discountCents,
    taxCents, rawTotalCents, roundOffCents, totalCents,
    advanceDeductedCents, returnCreditCents: returnCredit, creditAppliedCents,
    dueCents, refundOutCents,
  };
}
