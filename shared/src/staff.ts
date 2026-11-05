import { z } from "zod";

export const StaffUserInput = z.object({
  name: z.string().min(1, "Enter their name"),
  username: z.string().min(1, "Enter a username"),
  password: z.string().min(4, "Password must be at least 4 characters").optional(),
  canStock: z.boolean().default(false),
  canCost: z.boolean().default(false),
  salaryCents: z.number().int().nonnegative().default(0),
  commissionPct: z.number().int().min(0).max(100).default(0),
  monthlyTargetCents: z.number().int().nonnegative().default(0),
  targetBonusCents: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
});
export type StaffUserInput = z.infer<typeof StaffUserInput>;

export const MechanicInput = z.object({
  name: z.string().min(1, "Enter their name"),
  salaryCents: z.number().int().nonnegative().default(0),
  commissionPct: z.number().int().min(0).max(100).default(0),
  monthlyTargetCents: z.number().int().nonnegative().default(0),
  targetBonusCents: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
});
export type MechanicInput = z.infer<typeof MechanicInput>;
