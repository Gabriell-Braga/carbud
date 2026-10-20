import { z } from "zod";
import { WHATSAPP_FORM_FIELDS } from "@carbud/site-kit/catalog";

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use uma cor no formato #RRGGBB");

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    schema.optional(),
  );

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
  phone: optional(z.string().trim().max(20)),
  whatsapp: optional(z.string().trim().max(20)),
  whatsappForm: z.boolean().optional(),
  whatsappFormFields: z.array(z.enum(WHATSAPP_FORM_FIELDS)).max(WHATSAPP_FORM_FIELDS.length).optional(),
  email: optional(z.string().trim().toLowerCase().email("E-mail inválido")),
  addressStreet: optional(z.string().trim().max(160)),
  addressNumber: optional(z.string().trim().max(20)),
  addressComplement: optional(z.string().trim().max(80)),
  addressDistrict: optional(z.string().trim().max(80)),
  addressCity: optional(z.string().trim().max(80)),
  addressState: optional(z.string().trim().max(2)),
  addressZip: optional(z.string().trim().max(12)),
  mapsUrl: optional(z.string().trim().url("Informe uma URL válida").max(500)),
  businessHours: optional(businessHoursSchema),
  social: optional(
    z.object({
      instagram: optional(z.string().trim().max(200)),
      facebook: optional(z.string().trim().max(200)),
      youtube: optional(z.string().trim().max(200)),
      tiktok: optional(z.string().trim().max(200)),
    }),
  ),
  aboutTitle: optional(z.string().trim().max(120)),
  aboutText: optional(z.string().trim().max(5000)),
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

  legalPrivacy: optional(z.string().trim().max(50_000)),
  legalTerms: optional(z.string().trim().max(50_000)),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

export const bannerSchema = z.object({
  title: optional(z.string().trim().max(120)),
  subtitle: optional(z.string().trim().max(240)),
  ctaLabel: optional(z.string().trim().max(40)),
  ctaHref: optional(z.string().trim().max(300)),
  active: z.boolean().default(true),
  position: z.coerce.number().int().min(0).max(50).default(0),
});
