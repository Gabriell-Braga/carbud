import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  default: "text-text",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-positive",
};

/**
 * Número de destaque em estilo odômetro: display, tabular, grande.
 *
 * No celular o card encolhe (menos respiro, número menor, sem a legenda):
 * cinco deles empilhados a 160px cada empurravam a lista para fora da
 * primeira tela, e a lista é o motivo de a pessoa ter aberto a página.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
  className?: string;
}) {
  return (
    <div
      data-theme-transition
      className={cn(
        "@container min-w-0 rounded border border-border bg-surface px-3.5 py-3 sm:px-4 sm:py-3.5",
        className,
      )}
    >
      <p className="label-instrument truncate text-muted">{label}</p>
      <p
        className={cn(
          // o número encolhe com o card: "R$ 1.369.938,59" num card de 6
          // colunas passava da borda
          "odometer mt-1.5 whitespace-nowrap text-[clamp(14px,10.5cqw,22px)] leading-none sm:mt-2 sm:text-[clamp(14px,10.5cqw,26px)]",
          TONE[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 hidden text-xs text-faint sm:block">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 grid grid-cols-2 gap-2 sm:mb-5 sm:gap-2.5 lg:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
