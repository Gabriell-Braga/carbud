import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { affiliateCodeField } from "./affiliates";

const digits = (min: number, max: number, message: string) =>
  z
    .string()
    .transform((value) => onlyDigits(value))
    .refine((value) => value.length >= min && value.length <= max, message);

/**
 * Contratação no cartão pela própria revenda.
 *
 * Os dados do cartão só passam por aqui a caminho do Asaas: não são gravados,
 * logados nem devolvidos. Validação é de formato; quem diz se o cartão vale é
 * o gateway.
 */
export const cardSignupSchema = z.object({
  planId: z.string().min(1, "Escolha um plano"),
  card: z.object({
    holderName: z.string().trim().min(3, "Nome como está no cartão").max(100),
    number: digits(13, 19, "Número do cartão inválido"),
    expiryMonth: z
      .string()
      .trim()
      .regex(/^(0?[1-9]|1[0-2])$/, "Mês inválido")
      .transform((value) => value.padStart(2, "0")),
    expiryYear: z
      .string()
      .trim()
      .regex(/^(\d{2}|\d{4})$/, "Ano inválido")
      .transform((value) => (value.length === 2 ? `20${value}` : value)),
    ccv: digits(3, 4, "Código de segurança inválido"),
  }),
  holder: z.object({
    name: z.string().trim().min(3, "Informe o nome do titular").max(120),
    email: z.string().trim().toLowerCase().email("E-mail inválido"),
    cpfCnpj: digits(11, 14, "CPF ou CNPJ do titular inválido").refine(
      (value) => value.length === 11 || value.length === 14,
      "CPF ou CNPJ do titular inválido",
    ),
    postalCode: digits(8, 8, "CEP inválido"),
    addressNumber: z.string().trim().min(1, "Informe o número").max(20),
    phone: digits(10, 11, "Telefone com DDD"),
  }),
  affiliateCode: affiliateCodeField,
});

export type CardSignupInput = z.infer<typeof cardSignupSchema>;
