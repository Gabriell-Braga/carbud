import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { tenants } from "./tenants";

export const ROLES = ["super_admin", "revenda_admin", "vendedor", "visualizador"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUS = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUS)[number];

/**
 * Equipe de venda (motos, carros, seminovos...). A equipe é da pessoa, não do
 * lead: o lead pertence à equipe de quem o atende, e trocar o responsável já
 * leva junto — sem duas informações para manter de acordo.
 */
export const teams = sqliteTable(
  "teams",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("teams_tenant_idx").on(table.tenantId)],
);

export type Team = typeof teams.$inferSelect;

export const users = sqliteTable(
  "users",
  {
    id: idColumn(),
    /** NULL = usuário da plataforma (super-admin). */
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    role: text("role").$type<Role>().notNull(),
    status: text("status").$type<UserStatus>().notNull().default("active"),
    storeId: text("store_id"),
    teamId: text("team_id"),
    /** Entra no rodízio de distribuição de leads. */
    receivesLeads: integer("receives_leads", { mode: "boolean" }).notNull().default(true),
    /**
     * Ajustes finos por pessoa, sobre o que o perfil já dá.
     *
     * Guardado como duas listas em vez de substituir o perfil: assim a pessoa
     * continua herdando as mudanças futuras do perfil dela, e o desvio fica
     * explícito na tela — "vendedor, e além disso pode X".
     */
    permissionOverrides: text("permission_overrides", { mode: "json" }).$type<{
      granted?: string[];
      revoked?: string[];
    }>(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Invalida todas as sessões emitidas antes deste instante. */
    sessionsValidFrom: integer("sessions_valid_from", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_tenant_idx").on(table.tenantId, table.status),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
