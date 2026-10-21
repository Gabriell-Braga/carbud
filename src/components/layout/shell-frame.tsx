"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Breadcrumb } from "./breadcrumb";
import { NavLink } from "./nav-link";
import { RouteProgress } from "./route-progress";
import { ShellSearch } from "./shell-search";
import { UserMenu } from "./user-menu";
import { Logo } from "./logo";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon?: React.ReactNode;
  exact?: boolean;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export type ShellUser = {
  name: string;
  email: string;
  roleLabel: string;
};

export function ShellFrame({
  contextLabel,
  homeHref,
  sections,
  user,
  themePreference,
  search,
  banner,
  children,
}: {
  contextLabel: string;
  homeHref: string;
  sections: NavSection[];
  user: ShellUser;
  themePreference: ThemePreference;
  search: { action: string; placeholder: string };
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-3">
      {sections.map((section, index) => (
        <div key={section.label ?? index} className="flex flex-col gap-0.5">
          {section.label ? (
            <p className="label-instrument px-3 pb-1 text-faint">{section.label}</p>
          ) : null}
          {section.items.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={() => setDrawerOpen(false)} />
          ))}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link
      href={homeHref}
      onClick={() => setDrawerOpen(false)}
      className="flex h-[var(--topbar-h)] shrink-0 items-center border-b border-border px-4"
    >
      <Logo className="h-6" />
    </Link>
  );

  return (
    <div data-density="compact" className="flex min-h-screen bg-bg">
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>

      {/*
        Sidebar fixa: `sticky top-0` + altura de viewport. Sem isso ela e uma
        coluna flex comum e desce junto com o scroll da pagina em telas altas.
      */}
      <aside
        data-theme-transition
        className="sticky top-0 hidden h-[100dvh] w-[var(--sidebar-w)] shrink-0 flex-col border-r border-border bg-surface md:flex"
      >
        {brand}
        {nav}
        <div className="shrink-0 border-t border-border px-3 py-2">
          <p className="label-instrument text-faint">{contextLabel}</p>
        </div>
      </aside>

      {/* -------------------------------------------------- gaveta mobile */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fechar navegação"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0"
            style={{ backgroundColor: "var(--overlay)" }}
          />
          <aside className="relative flex h-full w-[var(--sidebar-w)] flex-col border-r border-border bg-surface">
            {brand}
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ------------------------------------------------ topbar */}
        <header
          data-theme-transition
          className="sticky top-0 z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4"
        >
          <button
            type="button"
            aria-label="Abrir navegação"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-tag text-muted",
              "transition-colors hover:bg-surface-2 hover:text-text md:hidden",
            )}
          >
            {drawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-sm font-medium text-text">
              {contextLabel}
            </span>
            <Suspense fallback={null}>
              <Breadcrumb />
            </Suspense>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ShellSearch action={search.action} placeholder={search.placeholder} />
            <UserMenu
              name={user.name}
              email={user.email}
              roleLabel={user.roleLabel}
              themePreference={themePreference}
            />
          </div>
        </header>

        {banner}

        <main className="flex-1 px-3 py-4 sm:px-5 sm:py-5">{children}</main>
      </div>
    </div>
  );
}
