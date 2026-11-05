import { db } from "../db/client.js";
import { customers } from "../db/schema/index.js";

/** "+94 77 123 4567" and "077 123 4567" are the same Sri Lankan number. */
export function localDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("94") && d.length === 11 ? "0" + d.slice(2) : d;
}

/** Same person, same phone: reuse their record so a balance is never split across duplicates. */
export function findCustomerIdByPhone(phone: string): number | null {
  const digits = localDigits(phone);
  if (digits.length < 7) return null;
  return db.select().from(customers).all().find((c) => localDigits(c.phone) === digits)?.id ?? null;
}
