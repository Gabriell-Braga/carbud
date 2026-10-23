import type { Role } from "@/db/schema";

/**
 * Permissões granulares. Roles novas = uma linha nova em ROLE_PERMISSIONS,
 * sem tocar em nenhuma checagem espalhada pelo app.
 */
export const PERMISSIONS = [
  // plataforma (super-admin)
  "platform:tenants:read",
  "platform:tenants:write",
  "platform:billing:read",
  "platform:billing:write",
  "platform:users:write",
  "platform:audit:read",
  "platform:impersonate",
  "platform:affiliates:read",
  "platform:affiliates:write",
  "platform:affiliate-payouts:write",
  // tenant
  "vehicles:read",
  "vehicles:write",
  "leads:read",
  "leads:write",
  "site:read",
  "site:write",
  "users:read",
  "users:write",
  "tenant:settings",
  "financings:read",
  "financings:write",
  "appraisals:read",
  "appraisals:write",
  "stores:write",
  "reports:read",
  "api:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const TENANT_READ: Permission[] = [
  "vehicles:read",
  "leads:read",
  "site:read",
  "users:read",
  "financings:read",
  "appraisals:read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  revenda_admin: [
    ...TENANT_READ,
    "vehicles:write",
    "leads:write",
    "site:write",
    "users:write",
    "tenant:settings",
    "financings:write",
    "appraisals:write",
    "stores:write",
    "reports:read",
    "api:manage",
  ],
  vendedor: [
    "vehicles:read",
    "vehicles:write",
    "leads:read",
    "leads:write",
    "site:read",
    "financings:read",
    "financings:write",
    "appraisals:read",
    "appraisals:write",
  ],
  visualizador: [
    "vehicles:read",
    "leads:read",
    "site:read",
    "financings:read",
    "appraisals:read",
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  revenda_admin: "Administrador da revenda",
  vendedor: "Vendedor",
  visualizador: "Visualizador",
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Ajuste fino por pessoa, somado ao que o perfil já dá.
 *
 * Some e subtrai em cima do perfil em vez de substituí-lo: a pessoa continua
 * herdando mudanças futuras do perfil dela, e o desvio fica legível na tela
 * como "vendedor, e além disso pode X".
 *
 * Revogado vence concedido. Quando os dois aparecem, alguém errou ao montar —
 * e negar acesso por engano é conserto de um clique, enquanto conceder por
 * engano só se descobre depois do estrago.
 */
export type PermissionOverrides = { granted?: string[]; revoked?: string[] } | null | undefined;

export function canWithOverrides(
  role: Role,
  permission: Permission,
  overrides: PermissionOverrides,
): boolean {
  if (overrides?.revoked?.includes(permission)) return false;
  if (can(role, permission)) return true;
  return Boolean(overrides?.granted?.includes(permission));
}

/** Tudo o que a pessoa pode, já com os ajustes aplicados. */
export function effectivePermissions(role: Role, overrides: PermissionOverrides): Permission[] {
  return PERMISSIONS.filter((permission) => canWithOverrides(role, permission, overrides));
}

/** Permissões que fazem sentido ajustar à mão — as da plataforma ficam de fora. */
export const TENANT_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (permission) => !permission.startsWith("platform:"),
);

export const PERMISSION_LABELS: Record<string, string> = {
  "vehicles:read": "Ver estoque",
  "vehicles:write": "Editar estoque",
  "leads:read": "Ver leads",
  "leads:write": "Atender leads",
  "site:read": "Ver configurações do site",
  "site:write": "Editar o site",
  "users:read": "Ver usuários",
  "users:write": "Gerenciar usuários",
  "tenant:settings": "Configurações da revenda",
  "financings:read": "Ver financiamentos",
  "financings:write": "Lançar financiamentos",
  "appraisals:read": "Ver avaliações",
  "appraisals:write": "Avaliar veículos",
  "stores:write": "Gerenciar unidades",
  "reports:read": "Ver relatórios",
  "api:manage": "Gerenciar API e webhooks",
};

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/** Permissões que alteram estado — bloqueadas quando o tenant está em modo somente-leitura. */
export function isWritePermission(permission: Permission): boolean {
  return permission.endsWith(":write") || permission === "tenant:settings";
}

/** Roles que um usuário com determinada role pode criar/gerenciar. */
export function assignableRoles(role: Role): Role[] {
  if (role === "super_admin") return ["revenda_admin", "vendedor", "visualizador"];
  if (role === "revenda_admin") return ["revenda_admin", "vendedor", "visualizador"];
  return [];
}
