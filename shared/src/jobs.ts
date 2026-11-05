import { z } from "zod";
import { GradeKey } from "./parts.js";

export const JobServiceInput = z.object({
  serviceListId: z.number().int().positive().optional(),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  qty: z.number().int().positive().default(1),
});
export type JobServiceInput = z.infer<typeof JobServiceInput>;

export const JobPartInput = z.object({
  partId: z.number().int().positive(),
  grade: GradeKey,
  qty: z.number().int().positive(),
});
export type JobPartInput = z.infer<typeof JobPartInput>;

export const JobInput = z.object({
  customerId: z.number().int().positive().optional(),
  customerName: z.string().min(1, "Enter the customer name"),
  customerPhone: z.string().default(""),
  vehicleNo: z.string().default(""),
  model: z.string().default(""),
  mechanicId: z.number().int().positive({ message: "Select the mechanic" }),
  note: z.string().default(""),
  services: z.array(JobServiceInput).default([]),
  parts: z.array(JobPartInput).default([]),
}).refine((v) => v.services.length > 0 || v.parts.length > 0, { message: "Add at least one service or part" });
export type JobInput = z.infer<typeof JobInput>;

export const ServicePriceListInput = z.object({
  name: z.string().min(1, "Name is required"),
  priceCents: z.number().int().nonnegative(),
});
export type ServicePriceListInput = z.infer<typeof ServicePriceListInput>;
