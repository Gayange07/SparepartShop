import { describe, expect, it } from "vitest";
import { computeBillTotals, type BillSettings } from "./billing.js";

const settings: BillSettings = {
  maxDiscountPct: 5,
  autoDiscountOverCents: 500000,
  autoDiscountPct: 5,
  roundToCents: 1000,
  roundDirection: "down",
  taxPct: 0,
};

describe("computeBillTotals", () => {
  it("applies no discount below the big-bill threshold", () => {
    const r = computeBillTotals(300000, 0, settings, { discountPct: 0, autoDiscountAccepted: true, roundOff: false, isOwner: false });
    expect(r.autoEligible).toBe(false);
    expect(r.discountCents).toBe(0);
    expect(r.totalCents).toBe(300000);
  });

  it("auto-applies the big-bill discount when subtotal meets the threshold and staff hasn't unticked it", () => {
    const r = computeBillTotals(600000, 0, settings, { discountPct: 0, autoDiscountAccepted: true, roundOff: false, isOwner: false });
    expect(r.autoEligible).toBe(true);
    expect(r.autoDiscountApplied).toBe(true);
    expect(r.discountPct).toBe(5);
    expect(r.discountCents).toBe(30000);
    expect(r.totalCents).toBe(570000);
  });

  it("does not apply the auto discount when staff unticks it", () => {
    const r = computeBillTotals(600000, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false });
    expect(r.autoDiscountApplied).toBe(false);
    expect(r.discountCents).toBe(0);
  });

  it("caps a staff member's manual discount at the setting", () => {
    const r = computeBillTotals(100000, 0, settings, { discountPct: 20, autoDiscountAccepted: true, roundOff: false, isOwner: false });
    expect(r.discountCapped).toBe(true);
    expect(r.discountPct).toBe(5);
  });

  it("does not cap the owner's manual discount", () => {
    const r = computeBillTotals(100000, 0, settings, { discountPct: 20, autoDiscountAccepted: true, roundOff: false, isOwner: true });
    expect(r.discountCapped).toBe(false);
    expect(r.discountPct).toBe(20);
  });

  it("lets the owner's bigger manual discount win over the auto discount on a qualifying bill", () => {
    const r = computeBillTotals(600000, 0, settings, { discountPct: 20, autoDiscountAccepted: true, roundOff: false, isOwner: true });
    expect(r.autoDiscountApplied).toBe(true);
    expect(r.discountPct).toBe(20);
    expect(r.discountCapped).toBe(false);
  });

  it("still gives the owner at least the auto discount even if their manual discount is smaller", () => {
    const r = computeBillTotals(600000, 0, settings, { discountPct: 2, autoDiscountAccepted: true, roundOff: false, isOwner: true });
    expect(r.discountPct).toBe(5);
  });

  it("keeps staff at exactly the auto discount on a qualifying bill, never capped below it", () => {
    const r = computeBillTotals(600000, 0, settings, { discountPct: 0, autoDiscountAccepted: true, roundOff: false, isOwner: false });
    expect(r.discountPct).toBe(5);
    expect(r.discountCapped).toBe(false);
  });

  it("still caps a staff member's manual discount when auto-discount doesn't apply (bill too small)", () => {
    const r = computeBillTotals(100000, 0, settings, { discountPct: 20, autoDiscountAccepted: true, roundOff: false, isOwner: false });
    expect(r.autoDiscountApplied).toBe(false);
    expect(r.discountCapped).toBe(true);
    expect(r.discountPct).toBe(5);
  });

  it("rounds the total down to the nearest step when round off is on", () => {
    const r = computeBillTotals(123450, 0, settings, { discountPct: 0, autoDiscountAccepted: true, roundOff: true, isOwner: false });
    expect(r.totalCents).toBe(123000);
    expect(r.roundOffCents).toBe(-450);
  });

  it("rounds to nearest when the setting says nearest", () => {
    const nearestSettings: BillSettings = { ...settings, roundDirection: "nearest" };
    const r = computeBillTotals(123600, 0, nearestSettings, { discountPct: 0, autoDiscountAccepted: true, roundOff: true, isOwner: false });
    expect(r.totalCents).toBe(124000);
  });

  it("applies discount before round off, in that order", () => {
    // subtotal 600000, 5% auto discount -> 570000, then rounds down to nearest 1000 -> unchanged here but order matters for odd cents
    const oddSettings: BillSettings = { ...settings, autoDiscountOverCents: 100000 };
    const r = computeBillTotals(100333, 0, oddSettings, { discountPct: 0, autoDiscountAccepted: true, roundOff: true, isOwner: false });
    // 5% of 100333 = 5017 (rounded), taxable = 95316, rounded down to nearest 1000 = 95000
    expect(r.discountCents).toBe(5017);
    expect(r.totalCents).toBe(95000);
  });

  it("includes service charges in the subtotal", () => {
    const r = computeBillTotals(100000, 50000, settings, { discountPct: 0, autoDiscountAccepted: true, roundOff: false, isOwner: false });
    expect(r.subtotalCents).toBe(150000);
  });

  it("deducts a pre-order advance from the total to compute what's due", () => {
    const r = computeBillTotals(500000, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false, advanceDeductedCents: 100000 });
    expect(r.totalCents).toBe(500000);
    expect(r.dueCents).toBe(400000);
  });

  it("never deducts more advance than the total", () => {
    const r = computeBillTotals(100000, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false, advanceDeductedCents: 999999 });
    expect(r.advanceDeductedCents).toBe(100000);
    expect(r.dueCents).toBe(0);
  });

  it("applies tax on the discounted amount, not the raw subtotal", () => {
    const taxSettings: BillSettings = { ...settings, taxPct: 10 };
    const r = computeBillTotals(100000, 0, taxSettings, { discountPct: 10, autoDiscountAccepted: true, roundOff: false, isOwner: true });
    // subtotal 100000, discount 10% = 10000, taxable = 90000, tax 10% = 9000, total = 99000
    expect(r.taxCents).toBe(9000);
    expect(r.totalCents).toBe(99000);
  });

  it("applies a return credit against the total before computing what's due", () => {
    const r = computeBillTotals(300000, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false, returnCreditCents: 100000 });
    expect(r.totalCents).toBe(300000);
    expect(r.returnCreditCents).toBe(100000);
    expect(r.creditAppliedCents).toBe(100000);
    expect(r.dueCents).toBe(200000);
    expect(r.refundOutCents).toBe(0);
  });

  it("surfaces the excess as refundOutCents when return credit is bigger than the total (shop pays cash back)", () => {
    const r = computeBillTotals(100000, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false, returnCreditCents: 250000 });
    expect(r.totalCents).toBe(100000);
    expect(r.creditAppliedCents).toBe(100000);
    expect(r.dueCents).toBe(0);
    expect(r.refundOutCents).toBe(150000);
  });

  it("handles the pure-refund case (no items, return credit only) — total 0, cash to refund = credit", () => {
    const r = computeBillTotals(0, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false, returnCreditCents: 80000 });
    expect(r.totalCents).toBe(0);
    expect(r.dueCents).toBe(0);
    expect(r.refundOutCents).toBe(80000);
  });

  it("stacks a pre-order advance and a return credit together, refunding anything over the total", () => {
    const r = computeBillTotals(200000, 0, settings, { discountPct: 0, autoDiscountAccepted: false, roundOff: false, isOwner: false, advanceDeductedCents: 50000, returnCreditCents: 300000 });
    expect(r.totalCents).toBe(200000);
    expect(r.creditAppliedCents).toBe(200000); // 50k + 300k clamped to total
    expect(r.dueCents).toBe(0);
    expect(r.refundOutCents).toBe(150000); // 50k + 300k - 200k
  });
});
