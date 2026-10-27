import { z } from "zod";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import { onlyDigits } from "@/lib/utils";
import { cardSignupSchema } from "./card-signup";

/**
 * Contratação pública, vinda da página de planos: cria a revenda e o acesso
 * de quem contratou e cobra o cartão no mesmo envio. O titular do cartão segue
 * as regras da contratação pelo painel.
 */
/** Muda junto com o texto de /termos; fica gravado na auditoria da contratação. */
export const TERMS_VERSION = "2026-10-27";

export const checkoutSchema = cardSignupSchema.extend({
  acceptedTerms: z.literal(true, { message: "Aceite os Termos de Uso para continuar" }),
  captchaToken: z.string().optional(),
  account: z.object({
    storeName: z.string().trim().min(2, "Informe o nome da revenda").max(120),
    document: z
      .string()
      .transform((value) => onlyDigits(value))
      .refine((value) => value.length === 11 || value.length === 14, "CNPJ ou CPF inválido"),
    name: z.string().trim().min(2, "Informe seu nome").max(120),
    email: z.string().trim().toLowerCase().email("E-mail inválido"),
    password: strongPasswordSchema,
  }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
