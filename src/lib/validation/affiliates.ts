import { z } from "zod";
import { AFFILIATE_STATUS } from "@/db/schema";
import { MAX_COMMISSION_BPS } from "@/lib/affiliates/rules";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

/** Pontos-base inteiros: o percentual nunca é inventado nem arredondado em silêncio. */
const commissionBps = z
  .number({ error: "Informe o percentual de comissão" })
  .int("Use no máximo duas casas decimais no percentual")
  .min(0, "O percentual não pode ser negativo")
  .max(MAX_COMMISSION_BPS, "O percentual vai até 100%");

export const affiliateCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("")).transform((value) => value || null),
  phone: optionalText(20),
  notes: optionalText(1000),
  defaultCommissionBps: commissionBps,
});

export const affiliateUpdateSchema = affiliateCreateSchema.partial().extend({
  status: z.enum(AFFILIATE_STATUS).optional(),
});

/** Campo opcional do cadastro e da contratação. */
export const affiliateCodeField = z.string().trim().max(20).optional().or(z.literal(""));

export const affiliationCorrectionSchema = z.object({
  affiliateCode: z.string().trim().max(20).nullable(),
  reason: z.string().trim().min(5, "Explique o motivo da correção").max(500),
});

export const payoutSchema = z.object({
  amountCents: z.number().int().min(1, "Informe o valor repassado"),
  paidAt: z.coerce.date(),
  reference: z.string().trim().min(1, "Informe a referência do pagamento").max(120),
  note: optionalText(500),
  idempotencyKey: z.string().uuid(),
  confirmed: z.literal(true, { error: "Confirme que o repasse já foi pago" }),
});

export const voidPayoutSchema = z.object({
  reason: z.string().trim().min(5, "Explique o motivo da anulação").max(500),
});

export const factReviewSchema = z.object({
  baseCents: z.number().int().min(1, "Informe a base comissionável"),
  reason: z.string().trim().min(5, "Explique de onde veio a base").max(500),
});
