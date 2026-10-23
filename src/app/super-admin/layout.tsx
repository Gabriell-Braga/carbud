import { Building2, Handshake, LayoutDashboard, ScrollText, SlidersHorizontal, Tags, Users } from "lucide-react";
import { AppShell, type NavSection } from "@/components/layout/shell";
import { requireSuperAdminPage } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/rbac";

import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

const ICON = "h-3.5 w-3.5";

/**
 * Três grupos, cada um com um sentido próprio: o que se opera,
 * o que se cobra e o que sustenta a plataforma.
 *
 * "Configurações" mora em Cobrança porque é onde vivem multa, juros, trial e
 * o gateway — nada ali é configuração de sistema.
 */
const SECTIONS: NavSection[] = [
  {
    label: "Operação",
    items: [
      {
        href: "/super-admin",
        label: "Visão geral",
        icon: <LayoutDashboard className={ICON} />,
        exact: true,
      },
      { href: "/super-admin/revendas", label: "Revendas", icon: <Building2 className={ICON} /> },
    ],
  },
  {
    label: "Cobrança",
    items: [
      { href: "/super-admin/planos", label: "Planos", icon: <Tags className={ICON} /> },
      { href: "/super-admin/afiliados", label: "Afiliados", icon: <Handshake className={ICON} /> },
      {
        href: "/super-admin/configuracoes",
        label: "Configurações",
        icon: <SlidersHorizontal className={ICON} />,
      },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { href: "/super-admin/usuarios", label: "Usuários", icon: <Users className={ICON} /> },
      { href: "/super-admin/auditoria", label: "Auditoria", icon: <ScrollText className={ICON} /> },
    ],
  },
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSuperAdminPage();

  return (
    <AppShell
      contextLabel="Painel Geral"
      homeHref="/super-admin"
      sections={SECTIONS}
      search={{ action: "/super-admin/revendas", placeholder: "Buscar revenda" }}
      user={{
        name: context.user.name,
        email: context.user.email,
        roleLabel: ROLE_LABELS[context.role],
      }}
    >
      {children}
    </AppShell>
  );
}
