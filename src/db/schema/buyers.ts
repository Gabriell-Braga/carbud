import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";

/**
 * Comprador do Portal Carbud.
 *
 * Não é usuário do painel: não tem senha, não pertence a revenda nenhuma e
 * nunca enxerga lead ou estoque de ninguém. Entra só com código por e-mail.
 * Fica em tabela própria justamente para nenhum guard do painel confundir os dois.
 */
export const buyers = sqliteTable(
  "buyers",
  {
    id: idColumn(),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    /** Novidades e ofertas: consentimento separado do login (LGPD), desmarcado por padrão. */
    marketingOptIn: integer("marketing_opt_in", { mode: "boolean" }).notNull().default(false),
    marketingOptInAt: integer("marketing_opt_in_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("buyers_email_unique").on(table.email)],
);

/** Código de seis dígitos enviado por e-mail. Só o SHA-256 fica no banco. */
export const buyerCodes = sqliteTable(
  "buyer_codes",
  {
    id: idColumn(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [index("buyer_codes_email_idx").on(table.email, table.createdAt)],
);

/** Sessão do portal. O token vive no cookie do portal; aqui só o hash. */
export const buyerSessions = sqliteTable(
  "buyer_sessions",
  {
    id: idColumn(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("buyer_sessions_token_unique").on(table.tokenHash),
    index("buyer_sessions_buyer_idx").on(table.buyerId),
  ],
);

export type FavoriteSnapshot = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  price: string;
  cover: string | null;
};

/**
 * Favoritos sincronizados. Guarda o retrato do card que o portal já mostra,
 * sem chave estrangeira para o veículo: anúncio vendido ou apagado continua
 * na lista até a pessoa tirar, igual ao favorito local.
 */
export const buyerFavorites = sqliteTable(
  "buyer_favorites",
  {
    buyerId: text("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<FavoriteSnapshot>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.buyerId, table.vehicleId] })],
);

export type Buyer = typeof buyers.$inferSelect;
