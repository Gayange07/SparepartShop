import { z } from "zod";

export const SettingsInput = z.object({
  shopName: z.string().min(1, "Shop name is required"),
  shopAddress: z.string().default(""),
  shopPhone: z.string().default(""),
  receiptFooter: z.string().default(""),
  maxDiscountPct: z.number().int().min(0).max(100).default(5),
  autoDiscountOverCents: z.number().int().nonnegative().default(500000),
  autoDiscountPct: z.number().int().min(0).max(100).default(5),
  roundToCents: z.number().int().positive().default(1000),
  roundDirection: z.enum(["down", "nearest"]).default("down"),
  taxPct: z.number().int().min(0).max(100).default(0),
});
export type SettingsInput = z.infer<typeof SettingsInput>;

export const OwnerAuthPasswordChangeInput = z.object({
  currentPassword: z.string().min(1, "Enter the current authorization password"),
  newPassword: z.string().min(4, "New password must be at least 4 characters"),
});
export type OwnerAuthPasswordChangeInput = z.infer<typeof OwnerAuthPasswordChangeInput>;
