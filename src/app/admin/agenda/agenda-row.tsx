"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { TaskKind } from "@/db/schema";
import { TASK_KIND_LABELS } from "@/lib/catalog/labels";
import { apiPatch } from "@/lib/client/api";
import { cn, formatDateTime, formatPhone, onlyDigits } from "@/lib/utils";

export type AgendaTask = {
  id: string;
  kind: TaskKind;
  dueAt: string;
  note: string | null;
  leadId: string;
  leadName: string;
  leadPhone: string;
  vehicleLabel: string | null;
  assignedToName: string | null;
};

export function AgendaRow({
  task,
  late,
  canWrite,
}: {
  task: AgendaTask;
  late: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function done() {
    setSaving(true);
    const result = await apiPatch(`/api/admin/tasks/${task.id}`, { status: "done" });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não consegui marcar", result.error);
      return;
    }
    toast.success("Feito", "Registrado na linha do tempo do lead.");
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
      <div className="min-w-0 flex-1">
        <p className={cn("text-xs tabular-nums", late ? "text-danger" : "text-muted")}>
          {/* hora no fuso do navegador: é o relógio de quem está olhando */}
          {formatDateTime(new Date(task.dueAt))} · {TASK_KIND_LABELS[task.kind]}
          {task.assignedToName ? ` · ${task.assignedToName}` : ""}
        </p>
        <Link
          href={`/admin/leads/${task.leadId}`}
          className="block truncate font-medium text-text hover:text-accent-text"
        >
          {task.leadName}
        </Link>
        <p className="truncate text-xs text-faint">
          {[onlyDigits(task.leadPhone) ? formatPhone(task.leadPhone) : null, task.vehicleLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {task.note ? <p className="mt-1 text-muted">{task.note}</p> : null}
      </div>
      {canWrite ? (
        <Button type="button" size="sm" variant="secondary" loading={saving} onClick={done}>
          <Check className="h-3.5 w-3.5" />
          Feito
        </Button>
      ) : null}
    </li>
  );
}
