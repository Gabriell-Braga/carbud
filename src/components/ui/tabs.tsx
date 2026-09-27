import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: string; href: string };

/**
 * Abas de navegação por link (funcionam sem JS).
 * Ativa = trilho âmbar de 2px embaixo, no mesmo espírito da sidebar.
 *
 * A fila rola na horizontal quando não cabe. Sem isso, seis abas somam mais
 * que a largura de um celular e empurram a PÁGINA para fora da tela — o
 * conteúdo inteiro passa a rolar de lado, que é bem pior do que a fila de
 * abas rolar sozinha.
 */
export function Tabs({ items, active }: { items: TabItem[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-0.5 overflow-x-auto border-b border-border">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm",
              "transition-colors duration-200 ease-out",
              selected
                ? "border-b-accent font-medium text-text"
                : "border-b-transparent text-muted hover:text-text",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
