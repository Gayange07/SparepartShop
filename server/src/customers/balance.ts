import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { sales, payments } from "../db/schema/index.js";

/** Credit balance = (credit bills' total - paid at time of sale) - payments received since. */
export function customerBalanceCents(customerId: number): number {
  const creditSales = db.select().from(sales)
    .where(and(eq(sales.customerId, customerId), eq(sales.paymentMethod, "credit"), eq(sales.status, "completed")))
    .all();
  const owedFromSales = creditSales.reduce((sum, s) => sum + (s.totalCents - s.amountPaidCents), 0);

  const paymentsReceived = db.select().from(payments)
    .where(and(eq(payments.type, "customer_credit"), eq(payments.partyId, customerId)))
    .all();
  const paid = paymentsReceived.reduce((sum, p) => sum + p.amountCents, 0);

  return owedFromSales - paid;
}
