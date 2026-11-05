import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  maxDiscountPct: integer("max_discount_pct").notNull().default(5),
  autoDiscountOverCents: integer("auto_discount_over_cents").notNull().default(500000),
  autoDiscountPct: integer("auto_discount_pct").notNull().default(5),
  roundToCents: integer("round_to_cents").notNull().default(1000),
  roundDirection: text("round_direction", { enum: ["down", "nearest"] }).notNull().default("down"),
  taxPct: integer("tax_pct").notNull().default(0),
  ownerAuthPasswordHash: text("owner_auth_password_hash").notNull(),
  shopName: text("shop_name").notNull().default("Spare Parts Shop"),
  shopAddress: text("shop_address").notNull().default(""),
  shopPhone: text("shop_phone").notNull().default(""),
  receiptFooter: text("receipt_footer").notNull().default(""),
});
