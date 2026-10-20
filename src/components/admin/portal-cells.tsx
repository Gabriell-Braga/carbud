import Link from "next/link";
import { getPortal, PUBLICATION_LABELS } from "@/lib/integrations/portals";
import type { StockPortalCell } from "@/lib/services/portals";
import { ML_NAMES } from "@/lib/services/portal-ad-types";
import { cn } from "@/lib/utils";

const SHORT: Record<string, string> = {
  mercadolivre: "ML",
  olx: "OLX",
  webmotors: "WM",
  chavesnamao: "CNM",
};

const TONE: Record<StockPortalCell["status"], string> = {
  publicado: "border-positive/40 bg-positive-soft text-positive",
  pendente: "border-accent/30 bg-accent-soft text-accent-text",
  erro: "border-warning/40 bg-warning-soft text-warning",
  removendo: "border-border bg-surface-2 text-muted",
  removido: "border-border bg-surface-2 text-faint",
  nao_enviado: "border-dashed border-border text-faint",
};

/** Pacote em texto curto; id que não é nome legível (Webmotors usa número) fica de fora. */
function typeName(portal: string, id: string | null): string | null {
  if (!id) return null;
  if (portal === "mercadolivre") return ML_NAMES[id] ?? null;
  return /^\d+$/.test(id) ? null : id;
}

/**
 * Um selo por portal conectado: cor pela situação, pacote ao lado e, no ar,
 * link direto para o anúncio. O motivo do erro vai no title, para não virar
 * paredão de texto na lista.
 */
export function PortalCells({ cells }: { cells: StockPortalCell[] }) {
  if (cells.length === 0) return <span className="text-faint">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {cells.map((cell) => {
        const name = getPortal(cell.portal)?.name ?? cell.portal;
        const pkg = typeName(cell.portal, cell.listingType);
        const label =
          cell.status === "nao_enviado" ? "Não enviado" : PUBLICATION_LABELS[cell.status];
        const title = [`${name}: ${label}`, pkg && `Pacote: ${pkg}`, cell.detail]
          .filter(Boolean)
          .join("\n");
        const href =
          cell.status === "publicado" && cell.url ? cell.url : `/admin/portais/${cell.portal}`;
        const external = href.startsWith("http");

        return (
          <Link
            key={cell.portal}
            href={href}
            title={title}
            aria-label={title.replace(/\n/g, ". ")}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80",
              TONE[cell.status],
            )}
          >
            {SHORT[cell.portal] ?? name}
            {pkg ? <span className="font-normal opacity-80">· {pkg}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
