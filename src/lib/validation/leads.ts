import { z } from "zod";
import { LEAD_STATUS, LOST_REASONS, PAYMENT_METHODS, TASK_KINDS } from "@/db/schema";
import { onlyDigits } from "@/lib/utils";

export const publicLeadSchema = z.object({
  tenantSlug: z.string().trim().min(1),
  vehicleId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  phone: z
    .string()
    .trim()
    .min(10, "Informe um telefone válido com DDD")
    .max(20)
    .refine((value) => onlyDigits(value).length >= 10, "Informe um telefone válido com DDD"),
  email: z.string().trim().toLowerCase().email("E-mail inválido").optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional(),
  /** Honeypot: preenchido só por bot. Aceita qualquer valor para não dar pista;
   *  o descarte acontece no handler. */
  website: z.string().max(200).optional(),
  utm: z
    .object({
      source: z.string().max(120).optional(),
      medium: z.string().max(120).optional(),
      campaign: z.string().max(120).optional(),
      term: z.string().max(120).optional(),
      content: z.string().max(120).optional(),
      referrer: z.string().max(500).optional(),
      page: z.string().max(500).optional(),
    })
    .optional(),

  /**
   * O que o navegador já sabe sobre esta conversão, para o envio pelo
   * servidor casar com o do pixel.
   *
   * `eventId` é o mesmo que o pixel mandou: é ele que impede a Meta de
   * contar o lead duas vezes. `fbp`/`fbc` são os cookies do pixel e
   * `gaClientId` o do GA — sem eles o evento até entra, mas desligado da
   * campanha que trouxe a visita, que é justamente o que se quer medir.
   */
  tracking: z
    .object({
      eventId: z.string().max(80).optional(),
      fbp: z.string().max(200).optional(),
      fbc: z.string().max(400).optional(),
      gaClientId: z.string().max(80).optional(),
      pageUrl: z.string().max(500).optional(),
    })
    .optional(),

  /**
   * De qual formulário o lead veio.
   *
   * Não é o canal — canal é `source`, e os três chegam por formulário. É a
   * INTENÇÃO, e ela decide o que nasce junto do lead: uma simulação vira
   * proposta de financiamento em rascunho, um "venda seu carro" vira
   * avaliação em rascunho. Sem isso, o vendedor receberia três leads iguais e
   * teria que redigitar no painel o que o cliente já digitou no site.
   */
  kind: z.enum(["contato", "financiamento", "venda", "whatsapp"]).default("contato"),

  /** Só quando `kind` é "financiamento". */
  financing: z
    .object({
      downPaymentCents: z.number().int().min(0).max(1_000_000_000),
      installments: z.number().int().min(1).max(120),
    })
    .optional(),

  /** Só quando `kind` é "venda": o carro que o cliente quer vender. */
  sellCar: z
    .object({
      brand: z.string().trim().min(1).max(60),
      model: z.string().trim().min(1).max(80),
      version: z.string().trim().max(120).optional(),
      yearManufacture: z.coerce.number().int().min(1950).max(2100),
      yearModel: z.coerce.number().int().min(1950).max(2100),
      mileageKm: z.coerce.number().int().min(0).max(2_000_000),
    })
    .optional(),
});

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUS).optional(),
  /** Etapa do funil; null tira o lead do quadro sem apagá-lo. */
  stageId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  /** Carro do interesse; null desliga. Lead de portal sem carro é ligado aqui. */
  vehicleId: z.string().uuid().nullable().optional(),
  lostReason: z.enum(LOST_REASONS).nullable().optional(),
  /** Texto que acompanha o motivo; vai para a linha do tempo, não para o lead. */
  lostNote: z.string().trim().max(1000).optional(),
  negotiation: z
    .object({
      brand: z.string().trim().max(60).optional(),
      model: z.string().trim().max(80).optional(),
      version: z.string().trim().max(120).optional(),
      paymentMethod: z.enum(PAYMENT_METHODS).optional(),
      valueCents: z.number().int().min(0).max(1_000_000_000).optional(),
      downPaymentCents: z.number().int().min(0).max(1_000_000_000).optional(),
      testDrive: z.boolean().optional(),
      tradeIn: z
        .object({
          brand: z.string().trim().max(60).optional(),
          model: z.string().trim().max(80).optional(),
          year: z.number().int().min(1950).max(2100).optional(),
          mileageKm: z.number().int().min(0).max(2_000_000).optional(),
          valueCents: z.number().int().min(0).max(1_000_000_000).optional(),
        })
        .nullable()
        .optional(),
      notes: z.string().trim().max(4000).optional(),
    })
    .optional(),
  /** Pediu para não receber campanha. */
  marketingOptOut: z.boolean().optional(),
});

export const leadTaskSchema = z.object({
  kind: z.enum(TASK_KINDS),
  dueAt: z.coerce.date(),
  note: z.string().trim().max(1000).nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export const leadTaskUpdateSchema = z.object({
  status: z.enum(["done", "canceled"]).optional(),
  dueAt: z.coerce.date().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  /** Como foi: entra na linha do tempo junto com o "feito". */
  outcome: z.string().trim().max(2000).nullable().optional(),
});

export const leadEventSchema = z.object({
  type: z.enum(["note", "call", "whatsapp", "email", "visit", "proposal"]),
  body: z.string().trim().min(1, "Escreva o que aconteceu").max(4000),
});
