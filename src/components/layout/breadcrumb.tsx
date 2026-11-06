"use client";

import { usePathname } from "next/navigation";
import { PORTALS } from "@/lib/integrations/portals";

/**
 * Trilha discreta na topbar. Só rótulos conhecidos entram — id cru vira
 * "Detalhe", para não exibir uuid na interface.
 */
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Painel",
  "super-admin": "Painel Geral",
  revendas: "Revendas",
  estoque: "Estoque",
  leads: "Leads",
  site: "Site",
  usuarios: "Usuários",
  auditoria: "Auditoria",
  funil: "Funil",
  agenda: "Agenda",
  campanhas: "Campanhas",
  proposta: "Proposta",
  atendimento: "Atendimento",
  financiamentos: "Financiamentos",
  relatorios: "Relatórios",
  unidades: "Unidades",
  integracoes: "API e webhooks",
  mensagens: "Mensagens",
  portais: "Portais",
  planos: "Planos",
  cupons: "Cupons",
  configuracoes: "Configurações",
  nova: "Nova",
  novo: "Novo",
  "trocar-senha": "Trocar senha",
};

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  const portal = PORTALS.find((item) => item.key === segment);
  if (portal) return portal.name;
  if (/^[0-9a-f-]{20,}$/i.test(segment)) return "Detalhe";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean).slice(1);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Trilha de navegação" className="hidden items-center gap-1.5 md:flex">
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-faint">
            /
          </span>
          <span className={index === segments.length - 1 ? "text-muted" : "text-faint"}>
            {labelFor(segment)}
          </span>
        </span>
      ))}
    </nav>
  );
}
