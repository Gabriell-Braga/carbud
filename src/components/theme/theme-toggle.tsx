"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Pinta na hora; a persistência vai por trás, sem travar o clique. */
function paintTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (preference !== "system") root.classList.add(preference);
}

/**
 * O tema que está pintado agora, lido do próprio documento.
 *
 * A classe no `<html>` é uma representação completa da preferência: `dark`,
 * `light`, ou nenhuma classe quando é "sistema" e o CSS decide. Isso vale
 * tanto para o que o servidor renderizou quanto para o que `paintTheme`
 * escreveu depois.
 */
function readPaintedTheme(): ThemePreference {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return "system";
}

/** Três opções em um seletor segmentado, do jeito de ferramenta: sem menu extra. */
export function ThemeToggle({ current }: { current: ThemePreference }) {
  const [preference, setPreference] = useState<ThemePreference>(current);

  /*
   * Ao remontar, o estado vem do DOM, e não da prop.
   *
   * `current` é o valor que o servidor mandou no carregamento da página, e ele
   * envelhece assim que alguém troca o tema sem recarregar. O menu do usuário
   * desmonta este componente ao fechar: reabrir marcava de novo a opção
   * antiga, enquanto a tela continuava pintada com a escolha nova. O tema
   * estava certo; só o seletor mentia.
   *
   * Roda uma vez, na montagem: depois disso quem manda é o clique.
   */
  useEffect(() => {
    setPreference(readPaintedTheme());
  }, []);

  async function handleSelect(next: ThemePreference) {
    const previous = preference;
    setPreference(next);
    paintTheme(next);

    // o servidor grava o cookie com o caminho certo; o cliente teria que
    // adivinhá-lo a partir do mount path, que vem vazio no bundle
    const result = await apiPost("/api/theme", { preference: next });
    if (!result.ok) {
      setPreference(previous);
      paintTheme(previous);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema do painel"
      className="flex items-center gap-0.5 rounded border border-border bg-surface-2 p-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        const active = preference === option;
        return (
          <Tooltip key={option} content={THEME_LABELS[option]}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void handleSelect(option)}
              className={cn(
                "flex h-6 w-7 items-center justify-center rounded-sm transition-colors",
                active
                  ? "bg-surface text-accent-text"
                  : "text-faint hover:text-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="sr-only">{THEME_LABELS[option]}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
