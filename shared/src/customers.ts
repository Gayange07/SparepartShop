import { z } from "zod";

export const CustomerInput = z.object({
  name: z.string().min(1, "Customer name is required"),
  phone: z.string().default(""),
  vehicleNo: z.string().default(""),
  manufacturer: z.string().default(""),
  model: z.string().default(""),
  nic: z.string().default(""),
  address: z.string().default(""),
  creditLimitCents: z.number().int().nonnegative().optional(),
});
export type CustomerInput = z.infer<typeof CustomerInput>;

export const PaymentInput = z.object({
  amountCents: z.number().int().positive("Enter the amount"),
  method: z.enum(["cash", "card", "cheque"]).default("cash"),
  note: z.string().default(""),
});
export type PaymentInput = z.infer<typeof PaymentInput>;
