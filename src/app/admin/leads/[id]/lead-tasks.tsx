"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { TASK_KINDS, type TaskKind } from "@/db/schema";
import { TASK_KIND_LABELS } from "@/lib/catalog/labels";
import { apiPatch, apiPost } from "@/lib/client/api";
import { cn, formatDateTime } from "@/lib/utils";

export type LeadTaskItem = {
  id: string;
  kind: TaskKind;
  dueAt: string;
  note: string | null;
  assignedToName: string | null;
};

/** "2026-11-07T10:00" no fuso do navegador, que é o que o datetime-local espera. */
function toLocalInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** Sugestão de horário: amanhã às 10h, o retorno mais comum. */
function tomorrowAtTen(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return toLocalInput(date);
}

export function LeadTasks({
  leadId,
  tasks: initial,
  assignees,
  canWrite,
}: {
  leadId: string;
  tasks: LeadTaskItem[];
  assignees: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [tasks, setTasks] = useState(initial);
  const [kind, setKind] = useState<TaskKind>("call");
  const [dueAt, setDueAt] = useState(tomorrowAtTen);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<{ id: string; value: string } | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!dueAt) {
      toast.error("Escolha dia e hora");
      return;
    }
    setSaving(true);
    const result = await apiPost<{ tasks: LeadTaskItem[] }>(`/api/admin/leads/${leadId}/tasks`, {
      kind,
      dueAt: new Date(dueAt).toISOString(),
      note: note.trim() || null,
      assignedToUserId: assignee || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não consegui agendar", result.error);
      return;
    }
    setTasks(result.data.tasks.map(serialize));
    setNote("");
    setDueAt(tomorrowAtTen());
    toast.success("Agendado");
    router.refresh();
  }

  async function update(taskId: string, payload: Record<string, unknown>, message: string) {
    setBusy(taskId);
    const result = await apiPatch<{ tasks: LeadTaskItem[] }>(`/api/admin/tasks/${taskId}`, payload);
    setBusy(null);
    if (!result.ok) {
      toast.error("Não consegui atualizar", result.error);
      return;
    }
    setTasks(result.data.tasks.map(serialize));
    setRescheduling(null);
    toast.success(message);
    router.refresh();
  }

  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximos passos</CardTitle>
        <CardDescription>Retornos e visitas combinados. Aparecem na agenda de quem atende.</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="mb-4 text-[13px] text-faint">Nada agendado.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {tasks.map((task) => {
              const late = new Date(task.dueAt).getTime() < now;
              return (
                <li key={task.id} className="rounded border border-border p-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-text">{TASK_KIND_LABELS[task.kind]}</p>
                      <p className={cn("text-xs", late ? "text-danger" : "text-muted")}>
                        {formatDateTime(new Date(task.dueAt))}
                        {late ? " · atrasado" : ""}
                        {task.assignedToName ? ` · ${task.assignedToName}` : ""}
                      </p>
                    </div>
                    {canWrite ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={busy === task.id}
                          onClick={() => update(task.id, { status: "done" }, "Marcado como feito")}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Feito
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Remarcar"
                          onClick={() =>
                            setRescheduling({ id: task.id, value: toLocalInput(new Date(task.dueAt)) })
                          }
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Cancelar"
                          onClick={() => update(task.id, { status: "canceled" }, "Cancelado")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {task.note ? <p className="mt-1 whitespace-pre-wrap text-muted">{task.note}</p> : null}
                  {rescheduling?.id === task.id ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input
                        type="datetime-local"
                        aria-label="Nova data e hora"
                        value={rescheduling.value}
                        onChange={(event) =>
                          setRescheduling({ id: task.id, value: event.target.value })
                        }
                        className="w-auto"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          update(
                            task.id,
                            { dueAt: new Date(rescheduling.value).toISOString() },
                            "Remarcado",
                          )
                        }
                      >
                        Salvar
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canWrite ? (
          <form onSubmit={add} className="border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              <FormField label="O quê" htmlFor={`${id}-kind`}>
                <Select
                  id={`${id}-kind`}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as TaskKind)}
                >
                  {TASK_KINDS.map((item) => (
                    <option key={item} value={item}>
                      {TASK_KIND_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Quando" htmlFor={`${id}-due`}>
                <Input
                  id={`${id}-due`}
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </FormField>
              <FormField label="Quem faz" htmlFor={`${id}-assignee`}>
                <Select
                  id={`${id}-assignee`}
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                >
                  <option value="">Responsável pelo lead</option>
                  {assignees.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Observação" htmlFor={`${id}-note`}>
                <Input
                  id={`${id}-note`}
                  value={note}
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Levar a avaliação do Onix"
                />
              </FormField>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={saving}>
                Agendar
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** A API devolve Date serializada; a tela trabalha com string ISO. */
function serialize(task: LeadTaskItem): LeadTaskItem {
  return { ...task, dueAt: new Date(task.dueAt).toISOString() };
}
