import { APP_NAME } from "@/lib/brand";
import { withBasePath } from "@/lib/paths";
import { cn } from "@/lib/utils";

/**
 * Logo do painel. As duas versões vão para a página e o CSS de
 * design-tokens.css mostra uma só: o tema pode vir da classe no <html> ou do
 * sistema, e só o CSS enxerga os dois sem piscar na hidratação.
 * A altura vem de `className` (ex.: `h-5`).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBasePath("/brand/carbud-crm-logo.svg")} alt={APP_NAME} className="logo-light h-full w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBasePath("/brand/carbud-crm-logo-white.svg")} alt={APP_NAME} className="logo-dark h-full w-auto" />
    </span>
  );
}
