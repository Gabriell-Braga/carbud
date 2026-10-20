"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Diálogo modal leve, sem Radix — o bundle roda em Worker e não vale carregar
 * uma árvore de dependências para isto. Cobre o essencial: Escape fecha, clique
 * fora fecha, foco entra ao abrir e volta para quem abriu ao fechar, e o Tab
 * fica preso dentro do diálogo.
 */
const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
} as const;

export type DialogSize = keyof typeof WIDTHS;

/**
 * Contrato de layout do diálogo, exportado para o teste conseguir travá-lo.
 *
 * Sem `max-h` + `flex-col` no painel e `overflow-y-auto` no corpo, um
 * formulário longo cresce além da tela e empurra o cabeçalho e o rodapé para
 * fora — a pessoa perde o título e o botão de salvar sem nenhum aviso.
 */
export const DIALOG_LAYOUT = {
  panel: "flex max-h-[calc(100dvh-2rem)] flex-col",
  header: "shrink-0",
  body: "min-h-0 flex-1 overflow-y-auto overscroll-contain",
  footer: "shrink-0",
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "sm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Opcional: uma confirmação diz tudo no título e na descrição. */
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  // quem usa passa `onClose` inline, nova a cada render; se ela entrasse nas
  // dependências do efeito, cada tecla digitada num campo do diálogo
  // devolveria o foco para quem abriu e depois para o primeiro botão
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      "input:not([disabled]), button:not([disabled]), select, textarea, [href]",
    );
    focusable?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "input:not([disabled]), button:not([disabled]), select, textarea, [href]",
        ),
      ).filter((item) => item.offsetParent !== null);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ backgroundColor: "var(--overlay)" }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "relative w-full rounded-card border border-border bg-surface",
          WIDTHS[size],
          DIALOG_LAYOUT.panel,
        )}
        style={{ boxShadow: "var(--shadow-menu)" }}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-3 border-b border-border px-5 py-4",
            DIALOG_LAYOUT.header,
          )}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-base font-semibold text-text">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className={cn(
              "shrink-0 rounded-sm text-faint transition-colors hover:text-text",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children ? (
          <div className={cn("px-5 py-4", DIALOG_LAYOUT.body)}>{children}</div>
        ) : null}

        {footer ? (
          <div
            className={cn(
              "flex items-center justify-end gap-2 border-t border-border px-5 py-4",
              DIALOG_LAYOUT.footer,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
