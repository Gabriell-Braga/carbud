import { cookies } from "next/headers";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ShellFrame, type NavItem, type NavSection, type ShellUser } from "./shell-frame";

export type { NavItem, NavSection, ShellUser };

export async function readThemePreference(): Promise<ThemePreference> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export async function AppShell({
  contextLabel,
  homeHref,
  sections,
  user,
  search,
  banner,
  children,
}: {
  contextLabel: string;
  homeHref: string;
  sections: NavSection[];
  user: ShellUser;
  search: { action: string; placeholder: string };
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const themePreference = await readThemePreference();

  return (
    <ShellFrame
      contextLabel={contextLabel}
      homeHref={homeHref}
      sections={sections}
      user={user}
      themePreference={themePreference}
      search={search}
      banner={banner}
    >
      {children}
    </ShellFrame>
  );
}

/**
 * Cabeçalho de página. Título em 24px — o painel não tem hero.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    // 20px até o conteúdo: o espaço em branco é o que separa os blocos aqui,
    // não uma régua ou uma borda
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="label-instrument mb-1 text-accent-text">{eyebrow}</p> : null}
        <h1 className="text-[24px] font-semibold leading-tight text-text">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Faixa de seção dentro da página, para separar blocos sem virar card. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="label-instrument mb-3 text-faint">{children}</p>;
}
