import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { tenants } from "./tenants";
import { users } from "./users";
import { vehicles } from "./vehicles";
import type { PublicationStatus } from "@/lib/integrations/portals";

export type PublicationMeta = {
  /** Tipo de anúncio pedido para este carro; ausente = o padrão do portal. */
  listingType?: string;
  /** O tipo que o portal confirmou para o anúncio no ar. */
  appliedListingType?: string;
  /** OLX: token do último lote, para consultar o resultado da moderação. */
  importToken?: string;
  /** OLX: id do anúncio na OLX (o externalId é o NOSSO id enviado). */
  listId?: string;
  /** OLX: último destaque aplicado (ISO) e as próximas voltas agendadas. */
  highlightedAt?: string;
  nextHighlights?: string[];
  /** Assinatura das fotos enviadas; muda, reenvia as fotos. */
  photosKey?: string;
};

export const CONNECTION_STATUS = ["desconectado", "conectado", "erro"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUS)[number];

/**
 * Conta da revenda em um portal, ligada pelo nosso painel.
 *
 * As credenciais ficam cifradas: são da revenda, não nossas, e precisamos do
 * valor original para autenticar na API do portal — hash não serviria.
 *
 * Uma conexão por portal por revenda: duas contas do mesmo portal publicariam
 * o mesmo carro duas vezes e brigariam entre si na hora de remover.
 */
export const portalConnections = sqliteTable(
  "portal_connections",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    portal: text("portal").notNull(),
    status: text("status").$type<ConnectionStatus>().notNull().default("desconectado"),
    /** Blob do cofre; nunca volta para a tela. */
    credentials: text("credentials"),
    settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>(),
    connectedByUserId: text("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("portal_connections_tenant_portal_unique").on(table.tenantId, table.portal),
  ],
);

export type PortalConnection = typeof portalConnections.$inferSelect;

/**
 * Estado de um veículo em um portal.
 *
 * Guardado por veículo e por portal porque cada um responde no seu tempo e
 * falha por motivos próprios. Sem isso, "publicado" viraria um sim/não da
 * revenda inteira, e ninguém saberia qual carro ficou para trás nem por quê.
 */
export const vehiclePublications = sqliteTable(
  "vehicle_publications",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    portal: text("portal").notNull(),
    /** Id do anúncio no portal — é como se atualiza e se remove depois. */
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    status: text("status").$type<PublicationStatus>().notNull().default("pendente"),
    lastError: text("last_error"),
    /**
     * O que cada portal precisa lembrar do anúncio e não cabe nas colunas
     * comuns: o tipo de anúncio escolhido para ESTE carro e o que está
     * aplicado lá, o lote da OLX, o último destaque, a assinatura das fotos.
     */
    meta: text("meta", { mode: "json" }).$type<PublicationMeta>(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("vehicle_publications_unique").on(table.vehicleId, table.portal),
    index("vehicle_publications_pending_idx").on(table.tenantId, table.status),
  ],
);

export type VehiclePublication = typeof vehiclePublications.$inferSelect;
