import { z } from "zod";
import { BILLING_STATUS, BLOCK_MODES, TENANT_STATUS } from "@/db/schema";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import { onlyDigits } from "@/lib/utils";

/** Slugs que colidem com rotas do app ou têm significado especial. */
export const RESERVED_SLUGS = [
  "admin", "super-admin", "api", "login", "logout", "bloqueado", "r", "app",
  "assets", "static", "public", "www", "site", "painel", "sitemap", "robots",
];

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O slug precisa ter ao menos 3 caracteres")
  .max(40, "O slug pode ter no máximo 40 caracteres")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens")
  .refine((value) => !RESERVED_SLUGS.includes(value), "Este slug é reservado pelo sistema");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/*
 * No update, campo apagado precisa virar null: `undefined` é "não mexer", e o
 * GTM, a razão social e o CNPJ apagados voltavam no F5 (e o GTM continuava
 * injetado no site).
 */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value));

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da revenda").max(120),
  slug: slugSchema,
  legalName: optionalText(160),
  cnpj: optionalText(20).transform((value) => (value ? onlyDigits(value) : undefined)),
  templateId: z.string().trim().min(1),
  blockMode: z.enum(BLOCK_MODES).default("readonly"),
  notes: optionalText(1000),
  // contato inicial do site
  phone: optionalText(20),
  whatsapp: optionalText(20),
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("")),
  addressCity: optionalText(80),
  addressState: optionalText(2),
  // adimplência inicial
  dueDay: z.coerce.number().int().min(1).max(28).default(10),
  amountCents: z.coerce.number().int().min(0).default(0),
  // usuário administrador inicial (opcional)
  adminName: optionalText(120),
  adminEmail: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("")),
  adminPassword: strongPasswordSchema.optional().or(z.literal("")),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema.optional(),
  legalName: clearableText(160),
  // a tela mascara o CNPJ; o banco guarda só dígitos, como no cadastro
  cnpj: clearableText(20).transform((value) => (value ? onlyDigits(value) : value)),
  status: z.enum(TENANT_STATUS).exclude(["deleted"]).optional(),
  templateId: z.string().trim().min(1).optional(),
  blockMode: z.enum(BLOCK_MODES).optional(),
  notes: clearableText(1000),
  gtmCode: clearableText(30),
});

export const billingUpdateSchema = z.object({
  status: z.enum(BILLING_STATUS).optional(),
  dueDay: z.coerce.number().int().min(1).max(28).optional(),
  graceDays: z.coerce.number().int().min(0).max(60).optional(),
  amountCents: z.coerce.number().int().min(0).optional(),
  currentDueDate: z.coerce.date().optional().nullable(),
  note: optionalText(500),
});

export const billingPaymentSchema = z.object({
  amountCents: z.coerce.number().int().min(0),
  /** Competência YYYY-MM. */
  referenceMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM"),
  paidAt: z.coerce.date().optional(),
  note: optionalText(500),
  /** Marca a revenda como adimplente e reativa o site. */
  markAsPaid: z.boolean().default(true),
});

/** Valida o código do GTM (GTM-XXXXXXX). */
export const gtmSchema = z
  .string()
  .trim()
  .regex(/^GTM-[A-Z0-9]{4,10}$/i, "Formato esperado: GTM-XXXXXXX")
  .optional()
  .or(z.literal(""));
