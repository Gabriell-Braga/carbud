import { z } from "zod";
import {
  EMAIL_COPY_FIELDS,
  EMAIL_COPY_LIMITS,
  EMAIL_TEMPLATE_KEYS,
  unknownVariables,
  type EmailCopy,
} from "@/lib/email/templates";

const copyShape = Object.fromEntries(
  EMAIL_COPY_FIELDS.map((field) => [
    field,
    z.string().max(EMAIL_COPY_LIMITS[field], `No máximo ${EMAIL_COPY_LIMITS[field]} caracteres`),
  ]),
) as Record<keyof EmailCopy, z.ZodString>;

/**
 * Textos de um modelo. Campo vazio é permitido e significa "usar o padrão".
 *
 * Variável desconhecida é recusada: `{{nme}}` sairia escrito assim no e-mail
 * de todo cliente, e o erro só seria visto por quem o recebesse.
 */
export const emailTemplateSchema = z
  .object({
    key: z.enum(EMAIL_TEMPLATE_KEYS),
    copy: z.object(copyShape).nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.copy) return;
    for (const field of EMAIL_COPY_FIELDS) {
      const unknown = unknownVariables(value.key, value.copy[field]);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["copy", field],
          message: `Variável desconhecida: ${unknown.map((name) => `{{${name}}}`).join(", ")}`,
        });
      }
    }
  });
