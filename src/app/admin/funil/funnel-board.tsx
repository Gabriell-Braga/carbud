"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client/api";
import { cn, formatPhone } from "@/lib/utils";
import { LostReasonDialog, type LostChoice } from "@/components/admin/lost-reason-dialog";
import { StageManager } from "./stage-manager";

export type BoardCard = {
  id: string;
  name: string;
  phone: string;
  vehicleLabel: string | null;
  assignedToName: string | null;
  createdAt: string;
  source: string;
};

export type BoardColumn = {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  cards: BoardCard[];
};

const KIND_TONE = { open: "neutral", won: "success", lost: "danger" } as const;

/** Dias desde a chegada — é o que denuncia lead esquecido numa coluna. */
function ageInDays(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

export function FunnelBoard({
  columns,
  orphans,
  canWrite,
  canConfigure,
}: {
  columns: BoardColumn[];
  orphans: number;
  canWrite: boolean;
  canConfigure: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [board, setBoard] = useState(columns);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [adopting, setAdopting] = useState(false);
  // perder pede motivo: o card só se move depois que a pessoa responde
  const [pendingLoss, setPendingLoss] = useState<{ cardId: string; toColumnId: string; name: string } | null>(null);

  async function moveCard(cardId: string, toColumnId: string, lost?: LostChoice) {
    const from = board.find((column) => column.cards.some((card) => card.id === cardId));
    if (!from || from.id === toColumnId) return;

    const target = board.find((column) => column.id === toColumnId);
    if (target?.kind === "lost" && from.kind !== "lost" && !lost) {
      const name = from.cards.find((item) => item.id === cardId)?.name ?? "Lead";
      setPendingLoss({ cardId, toColumnId, name });
      return;
    }

    const card = from.cards.find((item) => item.id === cardId)!;
    const previous = board;

    // move na tela primeiro; volta atrás se a API recusar
    setBoard((current) =>
      current.map((column) => {
        if (column.id === from.id) {
          return { ...column, cards: column.cards.filter((item) => item.id !== cardId) };
        }
        if (column.id === toColumnId) return { ...column, cards: [card, ...column.cards] };
        return column;
      }),
    );

    const result = await apiPatch(`/api/admin/leads/${cardId}`, { stageId: toColumnId, ...lost });
    if (!result.ok) {
      setBoard(previous);
      toast.error("Não consegui mover", result.error);
      return;
    }
    router.refresh();
  }

  async function handleAdopt() {
    setAdopting(true);
    const result = await apiPost<{ adopted: number }>("/api/admin/pipeline/adopt");
    setAdopting(false);

    if (!result.ok) {
      toast.error("Não consegui trazer os leads", result.error);
      return;
    }
    toast.success("Leads trazidos para o funil", `${result.data.adopted} lead(s) na primeira etapa.`);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {orphans > 0 && canWrite ? (
          <Button type="button" variant="secondary" loading={adopting} onClick={handleAdopt}>
            Trazer {orphans} lead(s) para o funil
          </Button>
        ) : null}
        {canConfigure ? (
          <Button type="button" variant="secondary" onClick={() => setManaging(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Editar etapas
          </Button>
        ) : null}
      </div>

      {/* rolagem horizontal só do quadro: a página nunca rola de lado */}
      <div className="-mx-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3 px-1">
          {board.map((column) => (
            <section
              key={column.id}
              onDragOver={(event) => {
                if (!canWrite) return;
                event.preventDefault();
                setOver(column.id);
              }}
              onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (dragging) void moveCard(dragging, column.id);
                setDragging(null);
              }}
              className={cn(
                "flex w-[248px] shrink-0 flex-col rounded border border-border bg-surface",
                over === column.id && "border-accent",
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge tone={KIND_TONE[column.kind]}>{column.name}</Badge>
                </div>
                <span className="text-xs text-faint tabular-nums">{column.cards.length}</span>
              </header>

              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {column.cards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-faint">Nada aqui</p>
                ) : (
                  column.cards.map((card) => {
                    const age = ageInDays(card.createdAt);
                    return (
                      <article
                        key={card.id}
                        draggable={canWrite}
                        onDragStart={() => setDragging(card.id)}
                        onDragEnd={() => setDragging(null)}
                        className={cn(
                          "rounded border border-border bg-surface-2 p-2.5 text-[13px]",
                          canWrite && "cursor-grab active:cursor-grabbing",
                          dragging === card.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          {canWrite ? (
                            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/leads/${card.id}`}
                              className="block truncate font-medium text-text hover:text-accent-text"
                            >
                              {card.name}
                            </Link>
                            <p className="truncate text-xs text-muted">{formatPhone(card.phone)}</p>
                            {card.vehicleLabel ? (
                              <p className="mt-1 truncate text-xs text-faint">
                                {card.vehicleLabel}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-faint">
                                {card.assignedToName ?? "sem dono"}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-xs tabular-nums",
                                  age > 14 ? "text-warning" : "text-faint",
                                )}
                              >
                                {age}d
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* mover sem arrastar: toque não faz drag-and-drop */}
                        {canWrite ? (
                          <select
                            aria-label={`Mover ${card.name} de etapa`}
                            value={column.id}
                            onChange={(event) => void moveCard(card.id, event.target.value)}
                            className="mt-2 h-7 w-full rounded-sm border border-border bg-surface px-1.5 text-xs text-muted sm:hidden"
                          >
                            {board.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <LostReasonDialog
        open={pendingLoss !== null}
        leadName={pendingLoss?.name ?? ""}
        onCancel={() => setPendingLoss(null)}
        onConfirm={async (choice) => {
          if (!pendingLoss) return;
          const { cardId, toColumnId } = pendingLoss;
          setPendingLoss(null);
          await moveCard(cardId, toColumnId, choice);
        }}
      />

      {managing ? (
        <StageManager
          stages={board.map((column) => ({
            id: column.id,
            name: column.name,
            kind: column.kind,
            count: column.cards.length,
          }))}
          onClose={() => setManaging(false)}
          onSaved={() => {
            setManaging(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
