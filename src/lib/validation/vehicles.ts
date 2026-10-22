import { z } from "zod";
import { isValidPlate, normalizePlate } from "@/lib/format/plate";
import { BODY_TYPES, FUELS, INSPECTION_RESULTS, TRANSMISSIONS, VEHICLE_STATUS } from "@/db/schema";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1950;

/*
 * Campo opcional apagado na tela chega como "" e precisa virar null, que
 * LIMPA a coluna. Virava undefined, que no update significa "não mexer": quem
 * escolhia "Não informado" na carroceria salvava, via "Veículo atualizado" e,
 * no F5, a carroceria antiga estava lá.
 */
const emptyToNull = (value: unknown) => (value === "" ? null : value);

/*
 * Sem .default() aqui de propósito. O Zod 4 aplica o default mesmo dentro de
 * .partial(): um PATCH só com a carroceria voltava com status "draft",
 * opcionais vazios e destaque desligado, e tirava o carro do ar.
 */
const vehicleFields = {
  brand: z.string().trim().min(1, "Informe a marca").max(60),
  model: z.string().trim().min(1, "Informe o modelo").max(80),
  version: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
  yearManufacture: z.coerce
    .number()
    .int()
    .min(MIN_YEAR, `Ano mínimo ${MIN_YEAR}`)
    .max(CURRENT_YEAR + 2),
  yearModel: z.coerce
    .number()
    .int()
    .min(MIN_YEAR, `Ano mínimo ${MIN_YEAR}`)
    .max(CURRENT_YEAR + 2),
  mileageKm: z.coerce.number().int().min(0, "Quilometragem inválida").max(2_000_000),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  priceOnRequest: z.boolean(),
  transmission: z.preprocess(emptyToNull, z.enum(TRANSMISSIONS).nullable().optional()),
  fuel: z.preprocess(emptyToNull, z.enum(FUELS).nullable().optional()),
  bodyType: z.preprocess(emptyToNull, z.enum(BODY_TYPES).nullable().optional()),
  color: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
  doors: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(6).nullable().optional()),
  /*
   * A placa e normalizada ANTES de validar: quem digita costuma pontuar
   * ("ABC-1234") e alternar maiuscula. Recusar por causa do hifen seria
   * cobrar da pessoa uma formatacao que o sistema sabe fazer sozinho.
   */
  licensePlate: z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      const plate = normalizePlate(typeof value === "string" ? value : "");
      return plate === "" ? null : plate;
    },
    z
      .string()
      .refine(isValidPlate, "Placa inválida. Use ABC1234 ou ABC1D23.")
      .nullable()
      .optional(),
  ),
  options: z.array(z.string().trim().max(60)).max(60),
  description: z.preprocess(emptyToNull, z.string().trim().max(5000).nullable().optional()),
  status: z.enum(VEHICLE_STATUS),
  featured: z.boolean(),
  fipeCode: z.string().trim().max(20).nullable().optional(),
  fipePriceCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  fipeReference: z.string().trim().max(40).nullable().optional(),
};

export const vehicleSchema = z.object({
  ...vehicleFields,
  priceOnRequest: vehicleFields.priceOnRequest.default(false),
  options: vehicleFields.options.default([]),
  status: vehicleFields.status.default("draft"),
  featured: vehicleFields.featured.default(false),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

/** Só o que veio no corpo é alterado; ausente não mexe, vazio limpa. */
export const vehicleUpdateSchema = z.object(vehicleFields).partial();

/** Filtros usados tanto no painel quanto no site público. */
export const vehicleFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(60).optional(),
  model: z.string().trim().max(80).optional(),
  status: z.enum(VEHICLE_STATUS).optional(),
  transmission: z.enum(TRANSMISSIONS).optional(),
  fuel: z.enum(FUELS).optional(),
  bodyType: z.enum(BODY_TYPES).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  yearMin: z.coerce.number().int().min(MIN_YEAR).optional(),
  yearMax: z.coerce.number().int().max(CURRENT_YEAR + 2).optional(),
  kmMax: z.coerce.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  sort: z
    .enum(["recentes", "preco-asc", "preco-desc", "km-asc", "ano-desc"])
    .default("recentes"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});

export type VehicleFilters = z.infer<typeof vehicleFiltersSchema>;

export const photoOrderSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(60),
});

export const photoCoverSchema = z.object({
  photoId: z.string().uuid(),
});

/** Dados do laudo de vistoria; o PDF vem junto, no mesmo envio. */
export const inspectionSchema = z.object({
  provider: z.string().trim().min(2, "Informe quem fez a vistoria").max(80),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .refine((value) => value <= new Date().toISOString().slice(0, 10), "A data do laudo não pode ser futura"),
  result: z.enum(INSPECTION_RESULTS),
});
