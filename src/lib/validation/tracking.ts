import { z } from "zod";

/**
 * O que a revenda cola na tela de rastreamento.
 *
 * Cada id é conferido pelo formato que a plataforma usa. Não é preciosismo:
 * um "G-" colado no campo do pixel não daria erro nenhum — o site apenas
 * deixaria de medir, e ninguém descobriria até alguém comparar o relatório
 * com a realidade semanas depois. Recusar na hora é a única forma de a pessoa
 * saber que errou o campo.
 *
 * Campo vazio limpa o conector: é como a revenda desliga um sem apagar os
 * outros.
 */

const empty = (value: unknown) => (value === "" || value === null ? undefined : value);

const optional = (schema: z.ZodString) => z.preprocess(empty, schema.optional());

export const trackingSchema = z.object({
  metaPixelId: optional(
    z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, "O id do pixel da Meta é só números (15 a 16 dígitos)."),
  ),
  metaPageId: optional(
    z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, "O id da página do Facebook é só números."),
  ),
  /** Token da API de Conversões. Vai para o cofre e não volta para a tela. */
  metaAccessToken: optional(z.string().trim().min(20).max(500)),
  ga4MeasurementId: optional(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^G-[A-Z0-9]{4,15}$/, 'O id do GA4 começa com "G-".'),
  ),
  /** api_secret do Measurement Protocol. Vai para o cofre. */
  ga4ApiSecret: optional(z.string().trim().min(10).max(200)),
  googleAdsId: optional(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^AW-\d{6,15}$/, 'O id do Google Ads começa com "AW-".'),
  ),
  googleAdsLeadLabel: optional(
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{5,40}$/, "O rótulo da conversão é o trecho depois da barra."),
  ),
  googleAdsSaleLabel: optional(
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{5,40}$/, "O rótulo da conversão é o trecho depois da barra."),
  ),
  serverSide: z.boolean().optional(),
  /**
   * Apagar um segredo já guardado.
   *
   * Sem isso não haveria como desligar o envio pelo servidor: campo vazio
   * significa "não mexi", porque o valor nunca volta para a tela — mandar
   * vazio apagaria o token toda vez que a pessoa salvasse outro campo.
   */
  clearMetaAccessToken: z.boolean().optional(),
  clearGa4ApiSecret: z.boolean().optional(),
});

export type TrackingInput = z.infer<typeof trackingSchema>;
