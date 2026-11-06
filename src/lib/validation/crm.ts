import { z } from "zod";
import {
  DISTRIBUTION_MODES,
  FINANCING_STATUS,
  LEAD_SOURCES,
  LEAD_STATUS,
  STAGE_KINDS,
  TENANT_WEBHOOK_EVENTS,
} from "@/db/schema";

export const storeSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da unidade").max(80),
  whatsapp: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().toLowerCase().email("E-mail inválido").nullable().optional().or(z.literal("")),
  addressZip: z.string().trim().max(12).nullable().optional(),
  addressStreet: z.string().trim().max(160).nullable().optional(),
  addressNumber: z.string().trim().max(20).nullable().optional(),
  addressComplement: z.string().trim().max(80).nullable().optional(),
  addressDistrict: z.string().trim().max(80).nullable().optional(),
  addressCity: z.string().trim().max(80).nullable().optional(),
  addressState: z.string().trim().max(2).nullable().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const stageSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da etapa").max(40),
  kind: z.enum(STAGE_KINDS),
});

export const stageUpdateSchema = stageSchema.partial().extend({
  active: z.boolean().optional(),
});

export const stageOrderSchema = z.object({
  stageIds: z.array(z.string().uuid()).min(1),
});

export const routingSchema = z.object({
  mode: z.enum(DISTRIBUTION_MODES),
});

/** Valores em centavos; a tela converte antes de enviar. */
export const financingSchema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  vehicleLabel: z.string().trim().max(160).nullable().optional(),
  customerName: z.string().trim().min(2, "Informe o nome do cliente").max(120),
  customerDocument: z.string().trim().max(20).nullable().optional(),
  customerPhone: z.string().trim().max(20).nullable().optional(),
  bank: z.string().trim().max(80).nullable().optional(),
  vehiclePriceCents: z.number().int().min(0).max(1_000_000_000),
  downPaymentCents: z.number().int().min(0).max(1_000_000_000),
  installments: z.number().int().min(0).max(120),
  installmentCents: z.number().int().min(0).max(100_000_000),
  status: z.enum(FINANCING_STATUS),
  notes: z.string().trim().max(2000).nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Dê um nome para reconhecer a chave").max(60),
});

export const tenantWebhookSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Informe uma URL válida")
    .refine((value) => value.startsWith("https://"), "A URL precisa ser https"),
  events: z.array(z.enum(TENANT_WEBHOOK_EVENTS)).min(1, "Escolha ao menos um evento"),
  active: z.boolean().optional(),
});

export const permissionOverridesSchema = z.object({
  granted: z.array(z.string()).max(40).optional(),
  revoked: z.array(z.string()).max(40).optional(),
});

export const campaignAudienceSchema = z.object({
  interest: z.string().trim().max(80).optional(),
  statuses: z.array(z.enum(LEAD_STATUS)).max(4).optional(),
  sources: z.array(z.enum(LEAD_SOURCES)).max(10).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  teamId: z.string().uuid().optional(),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à campanha").max(80),
  /** LGPD: para que os dados do cliente estão sendo usados nesta mensagem. */
  purpose: z.string().trim().min(5, "Diga a finalidade da campanha").max(300),
  audience: campaignAudienceSchema,
  templateName: z.string().trim().min(1, "Escolha o modelo").max(512),
  templateLanguage: z.string().trim().min(2).max(10),
  parameters: z.array(z.string().trim().min(1, "Preencha todas as variáveis").max(200)).max(10),
  vehicleId: z.string().uuid().nullable().optional(),
});

export const metaLeadConnectionSchema = z.object({
  pageId: z.string().trim().regex(/^\d{5,30}$/, "O ID da página tem só números"),
  pageName: z.string().trim().max(120).nullable().optional(),
  pageAccessToken: z.string().trim().min(20, "Cole o token da página").max(1000),
  appSecret: z.string().trim().min(16, "Cole a chave secreta do app").max(200),
  verifyToken: z.string().trim().min(8, "Use ao menos 8 caracteres").max(200),
});
