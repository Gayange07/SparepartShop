import { z } from "zod";

export const LoginRequest = z.object({
  username: z.string().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const OwnerPasswordRequest = z.object({
  password: z.string().min(1, "Enter the authorization password"),
});
export type OwnerPasswordRequest = z.infer<typeof OwnerPasswordRequest>;

export const SessionUser = z.object({
  id: z.number(),
  name: z.string(),
  username: z.string(),
  role: z.enum(["owner", "shopkeeper"]),
  canStock: z.boolean(),
  canCost: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUser>;
