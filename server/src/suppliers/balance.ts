import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { grns, payments, returns } from "../db/schema/index.js";

/** Supplier balance = GRN totals − paid at GRN time − payments since − returns. */
export function supplierBalanceCents(supplierId: number): number {
  const supplierGrns = db.select().from(grns).where(eq(grns.supplierId, supplierId)).all();
  const owedFromGrns = supplierGrns.reduce((sum, g) => sum + (g.totalCents - g.paidNowCents), 0);

  const paymentsReceived = db.select().from(payments)
    .where(and(eq(payments.type, "supplier"), eq(payments.partyId, supplierId)))
    .all();
  const paid = paymentsReceived.reduce((sum, p) => sum + p.amountCents, 0);

  const supplierReturns = db.select().from(returns)
    .where(and(eq(returns.partyType, "supplier"), eq(returns.supplierId, supplierId)))
    .all();
  const returned = supplierReturns.reduce((sum, r) => sum + r.amountCents, 0);

  return owedFromGrns - paid - returned;
}
