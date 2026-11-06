import { z } from "zod";
import { ROLES, USER_STATUS } from "@/db/schema";
import { strongPasswordSchema } from "@/lib/auth/password-policy";

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(ROLES).exclude(["super_admin"]),
  password: strongPasswordSchema,
  mustChangePassword: z.boolean().default(true),
});

export const createSuperAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: strongPasswordSchema,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUS).optional(),
  storeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  receivesLeads: z.boolean().optional(),
  permissionOverrides: z
    .object({
      granted: z.array(z.string()).max(40).optional(),
      revoked: z.array(z.string()).max(40).optional(),
    })
    .nullable()
    .optional(),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da equipe").max(40),
});

export const resetPasswordSchema = z.object({
  password: strongPasswordSchema,
  mustChangePassword: z.boolean().default(true),
});
