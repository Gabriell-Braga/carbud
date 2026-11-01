"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Dica no hover e no foco, no lugar do `title` do navegador (que demora,
 * não segue o tema e não aparece no foco do teclado).
 *
 * Vai para o `body` com posição fixa: dentro de tabela com rolagem
 * horizontal um balão absoluto seria cortado.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 48;
    setPosition({ x: rect.left + rect.width / 2, y: below ? rect.bottom + 6 : rect.top - 6, below });
  };
  const hide = () => setPosition(null);

  useEffect(() => {
    if (!position) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [position]);

  if (!content) return <>{children}</>;

  return (
    <span
      ref={ref}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={position ? id : undefined}
    >
      {children}
      {position
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={{
                left: Math.min(Math.max(position.x, 140), window.innerWidth - 140),
                top: position.y,
              }}
              className={cn(
                "pointer-events-none fixed z-[100] w-max max-w-64 -translate-x-1/2 whitespace-pre-line rounded-md bg-text px-2.5 py-1.5 text-xs leading-snug text-inverse shadow-lg",
                !position.below && "-translate-y-full",
              )}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
