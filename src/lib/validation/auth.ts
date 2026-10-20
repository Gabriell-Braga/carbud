import { z } from "zod";
import { strongPasswordSchema } from "@/lib/auth/password-policy";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  })
  // a senha atual já foi conferida contra o hash, então comparar as strings
  // basta; sem isso a provisória enviada pelo admin vira a senha definitiva
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual",
  });
