import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { tenants } from "./tenants";
import { users } from "./users";
import { vehicles } from "./vehicles";

export const LEAD_STATUS = ["new", "in_progress", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const LEAD_SOURCES = ["form", "whatsapp", "phone", "manual", "portal", "meta_ads"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type LeadUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  page?: string;
};

/**
 * Por que a venda não saiu. Lista fechada para o relatório conseguir somar —
 * texto livre vira vinte grafias de "caro" e não dá para comparar.
 */
export const LOST_REASONS = [
  "preco",
  "avaliacao_troca",
  "credito_negado",
  "comprou_outro_lugar",
  "desistiu",
  "sem_contato",
  "sem_estoque",
  "curioso",
  "outro",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const PAYMENT_METHODS = ["a_vista", "financiado", "consorcio", "troca_mais_volta"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Ficha de negociação: o que o cliente quer e como pretende pagar.
 *
 * JSON numa coluna, e não tabela própria, porque é sempre lida e gravada
 * inteira junto do lead. Marca e modelo ficam aqui mesmo quando o carro não
 * está no estoque — é isso que permite, meses depois, achar todo mundo que
 * queria um Kwid quando chegar um.
 */
export type LeadNegotiation = {
  brand?: string;
  model?: string;
  version?: string;
  paymentMethod?: PaymentMethod;
  valueCents?: number;
  downPaymentCents?: number;
  testDrive?: boolean;
  tradeIn?: {
    brand?: string;
    model?: string;
    year?: number;
    mileageKm?: number;
    valueCents?: number;
  } | null;
  notes?: string;
};

export const leads = sqliteTable(
  "leads",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    /** Snapshot do veículo no momento do lead (sobrevive à exclusão do anúncio). */
    vehicleLabel: text("vehicle_label"),
    name: text("name").notNull(),
    /**
     * Pode chegar vazio: lead de portal de classificados não traz telefone.
     * O Mercado Livre entrega a pergunta e o apelido de quem perguntou, e mais
     * nada — a conversa continua lá até a pessoa passar o contato. A coluna
     * segue NOT NULL porque trocar isso no SQLite exige reconstruir a tabela;
     * quem lê trata vazio como ausente (`formatPhone` já mostra "—").
     */
    phone: text("phone").notNull(),
    email: text("email"),
    message: text("message"),
    source: text("source").$type<LeadSource>().notNull().default("form"),
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    /** Etapa do funil. Nulo enquanto a revenda não montar o funil dela. */
    stageId: text("stage_id"),
    storeId: text("store_id"),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    internalNotes: text("internal_notes"),
    /**
     * Identidade do lead na origem, quando ele não nasceu aqui.
     * No Mercado Livre é `mercadolivre:<anúncio>:<comprador>`: a segunda
     * pergunta da mesma pessoa sobre o mesmo carro vira evento no lead que já
     * existe, e não um lead novo para a equipe atender duas vezes.
     */
    externalId: text("external_id"),
    utm: text("utm", { mode: "json" }).$type<LeadUtm>(),
    lostReason: text("lost_reason").$type<LostReason>(),
    negotiation: text("negotiation", { mode: "json" }).$type<LeadNegotiation>(),
    /**
     * Pediu para não receber campanha. Respondido "sair" no WhatsApp ou
     * marcado pela equipe; campanha nenhuma passa por cima disso (LGPD).
     */
    marketingOptOutAt: integer("marketing_opt_out_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("leads_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("leads_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("leads_vehicle_idx").on(table.vehicleId),
    index("leads_external_idx").on(table.tenantId, table.externalId),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
