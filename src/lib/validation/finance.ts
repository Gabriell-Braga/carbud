import { z } from "zod";

const emptyToNull = (value: unknown) => (value === "" ? null : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const cents = z.preprocess(
  emptyToNull,
  z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
);
const date = z.preprocess(emptyToNull, z.string().regex(DATE, "Data inválida").nullable().optional());
const text = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

/** Ausente não mexe, vazio limpa — mesma regra do PATCH de veículo. */
export const vehicleFinanceSchema = z.object({
  purchasePriceCents: cents,
  purchaseDate: date,
  purchaseSource: text(120),
  salePriceCents: cents,
  saleDate: date,
  buyerName: text(120),
  buyerDocument: text(20),
  buyerPhone: text(30),
  bankReturnCents: cents,
  notes: text(2000),
});

export type VehicleFinanceInput = z.infer<typeof vehicleFinanceSchema>;

/** As categorias que a Dri-Car já usava, mais as que toda loja tem; "Outros" cobre o resto. */
export const EXPENSE_CATEGORIES = [
  "Mecânica",
  "Funilaria",
  "Lavagem",
  "IPVA",
  "Documento",
  "Licenciamento",
  "Detalhamento",
  "Comissão",
  "Frete",
  "Outros",
] as const;

export const vehicleExpenseSchema = z.object({
  category: z.string().trim().min(1, "Informe a categoria").max(60),
  description: text(200),
  amountCents: z.coerce.number().int().min(1, "Informe o valor").max(1_000_000_000),
  date: z.string().regex(DATE, "Data inválida"),
});

export const financeFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  situation: z.enum(["todos", "estoque", "vendidos"]).catch("todos"),
  from: z.string().regex(DATE).optional().catch(undefined),
  to: z.string().regex(DATE).optional().catch(undefined),
});

export type FinanceFilters = z.infer<typeof financeFiltersSchema>;
