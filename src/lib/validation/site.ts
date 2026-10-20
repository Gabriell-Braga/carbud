import { z } from "zod";
import { WHATSAPP_FORM_FIELDS } from "@carbud/site-kit/catalog";
import { safeHref } from "@carbud/site-kit/links";

/** Link que vira href no site público: só http(s), caminho interno, âncora, mailto e tel. */
const href = (max: number) =>
  z.preprocess(
    // grava já normalizado ("instagram.com/x" vira "https://instagram.com/x")
    (value) => (typeof value === "string" ? (safeHref(value) ?? value) : value),
    z
      .string()
      .trim()
      .max(max)
      .refine((value) => safeHref(value) !== null, "Use um link, como https://instagram.com/sualoja"),
  );

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use uma cor no formato #RRGGBB");

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    schema.optional(),
  );

/*
 * Coluna de texto que a loja pode APAGAR. Vazio vira null, que limpa; com o
 * `optional` acima, vazio virava undefined ("não mexer") e o telefone, o
 * e-mail ou o título apagado voltava no F5. Ausente continua não mexendo.
 */
const clearable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? null : value), schema.nullable().optional());

export const businessHoursSchema = z.array(
  z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    open: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    close: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  }),
);

export const siteSettingsSchema = z.object({
  templateId: optional(z.string().trim().min(1)),
  theme: optional(
    z.object({
      // sem primaryHover: o hover sai de `primary`, calculado em `hoverShade`
      primary: optional(hexColor),
      primaryForeground: optional(hexColor),
      accent: optional(hexColor),
      text: optional(hexColor),
      muted: optional(hexColor),
      border: optional(hexColor),
      background: optional(hexColor),
      surface: optional(hexColor),
      success: optional(hexColor),
      fontHeading: optional(z.string().trim().max(120)),
      fontBody: optional(z.string().trim().max(120)),
      // com unidade: "12" sozinho é ignorado pelo border-radius e o card sai quadrado
      radius: optional(z.string().trim().regex(/^\d{1,2}px$/, "Use algo como 12px")),
    }),
  ),
  phone: clearable(z.string().trim().max(20)),
  whatsapp: clearable(z.string().trim().max(20)),
  whatsappForm: z.boolean().optional(),
  whatsappFormFields: z.array(z.enum(WHATSAPP_FORM_FIELDS)).max(WHATSAPP_FORM_FIELDS.length).optional(),
  email: clearable(z.string().trim().toLowerCase().email("E-mail inválido")),
  addressStreet: clearable(z.string().trim().max(160)),
  addressNumber: clearable(z.string().trim().max(20)),
  addressComplement: clearable(z.string().trim().max(80)),
  addressDistrict: clearable(z.string().trim().max(80)),
  addressCity: clearable(z.string().trim().max(80)),
  addressState: clearable(z.string().trim().max(2)),
  addressZip: clearable(z.string().trim().max(12)),
  mapsUrl: clearable(href(500)),
  businessHours: optional(businessHoursSchema),
  social: optional(
    z.object({
      instagram: optional(href(200)),
      facebook: optional(href(200)),
      youtube: optional(href(200)),
      tiktok: optional(href(200)),
    }),
  ),
  aboutTitle: clearable(z.string().trim().max(120)),
  aboutText: clearable(z.string().trim().max(5000)),
  gtmCode: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z
      .string()
      .trim()
      .regex(/^GTM-[A-Z0-9]{4,10}$/i, "Formato esperado: GTM-XXXXXXX")
      .optional(),
  ),
  /** Envie explicitamente para limpar o código herdado do super-admin. */
  clearGtm: z.boolean().optional(),

  /**
   * Números de vitrine. Até três — a faixa do site tem três colunas, e a
   * quarta entraria sobrando numa linha sozinha.
   */
  stats: optional(
    z
      .array(
        z.object({
          value: z.string().trim().max(20),
          label: z.string().trim().max(40),
        }),
      )
      .max(3),
  ),

  financing: optional(
    z.object({
      downPaymentPercent: z.coerce.number().int().min(0).max(90),
      /** Prazos do seletor, em meses, sem repetir e em ordem. */
      terms: z.array(z.coerce.number().int().min(1).max(120)).min(1).max(8),
    }),
  ),

  reviews: optional(
    z
      .array(
        z.object({
          rating: z.coerce.number().int().min(1).max(5),
          text: z.string().trim().min(1).max(400),
          author: z.preprocess(
            (value) => (value === "" ? null : value),
            z.string().trim().max(60).nullable(),
          ),
        }),
      )
      .max(6),
  ),

  legalPrivacy: clearable(z.string().trim().max(50_000)),
  legalTerms: clearable(z.string().trim().max(50_000)),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

export const bannerSchema = z.object({
  title: clearable(z.string().trim().max(120)),
  subtitle: clearable(z.string().trim().max(240)),
  ctaLabel: clearable(z.string().trim().max(40)),
  ctaHref: clearable(href(300)),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).max(50).default(0),
});
