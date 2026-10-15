"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barra fina de 2px no topo durante transições de rota.
 * Liga no clique de qualquer link interno e desliga quando a rota muda.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // a rota mudou: a navegação terminou
  useEffect(() => {
    setActive(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      // mesma rota (só muda o hash, ou é o link da página atual): o Next não
      // troca pathname nem searchParams, e a barra nunca desligaria
      const here = new URL(window.location.href);
      if (samePage(destination, here)) return;

      setActive(true);
    }

    function handlePopState() {
      setActive(true);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // rede: navegação que falha ou é cancelada não muda a rota; não deixa a barra
  // presa para sempre
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      role="progressbar"
      aria-label="Carregando página"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div
        className="h-full w-full bg-accent"
        style={{ animation: "cockpit-progress 1.1s ease-in-out infinite" }}
      />
    </div>
  );
}

function samePage(a: URL, b: URL) {
  const path = (url: URL) => url.pathname.replace(/\/+$/, "") || "/";
  return path(a) === path(b) && a.search === b.search;
}
