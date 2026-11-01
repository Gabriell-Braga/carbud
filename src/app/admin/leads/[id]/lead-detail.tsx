"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Send,
  StickyNote,
} from "lucide-react";
import { LeadStatusBadge } from "@/components/admin/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { LEAD_STATUS, type LeadSource, type LeadStatus } from "@/db/schema";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/lib/catalog/labels";
import { apiPatch, apiPost } from "@/lib/client/api";
import { formatDateTime, formatPhone, onlyDigits } from "@/lib/utils";
import { WhatsappSender, type Template } from "./whatsapp-sender";

type TimelineEvent = {
  id: string;
  type: string;
  body: string | null;
  userName: string | null;
  createdAt: string;
};

type LeadData = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  status: LeadStatus;
  stageId: string | null;
  assignedToUserId: string | null;
  internalNotes: string | null;
  source: string;
  utm: Record<string, string | undefined> | null;
  createdAt: string;
};

/** Cada tipo de contato tem ícone próprio: a linha do tempo é lida de relance. */
const EVENT_STYLE: Record<string, { icon: typeof Phone; label: string }> = {
  note: { icon: StickyNote, label: "Anotação" },
  call: { icon: Phone, label: "Ligação" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  email: { icon: Mail, label: "E-mail" },
  visit: { icon: CalendarCheck, label: "Visita" },
  proposal: { icon: FileText, label: "Proposta" },
  created: { icon: Send, label: "Entrada" },
  stage_change: { icon: Send, label: "Etapa" },
  assignment: { icon: Send, label: "Responsável" },
  status_change: { icon: Send, label: "Situação" },
};

const CONTACT_TYPES = ["call", "whatsapp", "visit", "email", "proposal", "note"] as const;

export function LeadDetail({
  lead,
  stages,
  assignees,
  events,
  canWrite,
  hasTimeline,
  hasFunnel,
  templates,
  sender,
  vehicleOptions,
}: {
  lead: LeadData;
  stages: { id: string; name: string; kind: string }[];
  assignees: { id: string; name: string }[];
  events: TimelineEvent[];
  canWrite: boolean;
  hasTimeline: boolean;
  hasFunnel: boolean;
  templates: Template[];
  sender: { name: string; tenantName: string };
  vehicleOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [status, setStatus] = useState(lead.status);
  const [stageId, setStageId] = useState(lead.stageId ?? "");
  const [assignee, setAssignee] = useState(lead.assignedToUserId ?? "");
  const [vehicleId, setVehicleId] = useState(lead.vehicleId ?? "");
  const [notes, setNotes] = useState(lead.internalNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const [timeline, setTimeline] = useState(events);
  const [eventType, setEventType] = useState<(typeof CONTACT_TYPES)[number]>("call");
  const [eventBody, setEventBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function patch(payload: Record<string, unknown>, rollback: () => void, message: string) {
    const result = await apiPatch(`/api/admin/leads/${lead.id}`, payload);
    if (!result.ok) {
      rollback();
      toast.error(result.error);
      return;
    }
    toast.success(message);
    router.refresh();
  }

  async function handleEvent(submit: React.FormEvent) {
    submit.preventDefault();
    if (eventBody.trim().length === 0) {
      toast.error("Escreva o que aconteceu");
      return;
    }

    setPosting(true);
    const result = await apiPost<{ events: TimelineEvent[] }>(
      `/api/admin/leads/${lead.id}/events`,
      { type: eventType, body: eventBody.trim() },
    );
    setPosting(false);

    if (!result.ok) {
      toast.error("Não consegui registrar", result.error);
      return;
    }
    setTimeline(result.data.events);
    setEventBody("");
    toast.success("Registrado na linha do tempo");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        {canWrite && onlyDigits(lead.phone) ? (
          <WhatsappSender
            leadId={lead.id}
            phone={lead.phone}
            templates={templates}
            context={{
              nome: lead.name,
              veiculo: lead.vehicleLabel,
              vendedor: sender.name,
              revenda: sender.tenantName,
              telefone: lead.phone,
            }}
            onSent={() => router.refresh()}
          />
        ) : null}

        {hasTimeline ? (
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>
                Tudo o que aconteceu com este lead, na ordem, com conversas e movimentações juntas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <form onSubmit={handleEvent} className="mb-5 border-b border-border pb-5">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {CONTACT_TYPES.map((type) => {
                      const style = EVENT_STYLE[type];
                      const Icon = style.icon;
                      const active = eventType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setEventType(type)}
                          aria-pressed={active}
                          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs transition-colors ${
                            active
                              ? "border-accent text-accent-text"
                              : "border-border text-muted hover:text-text"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {style.label}
                        </button>
                      );
                    })}
                  </div>

                  <Textarea
                    rows={3}
                    value={eventBody}
                    onChange={(event) => setEventBody(event.target.value)}
                    placeholder="Liguei, pediu para retornar amanhã de manhã..."
                    aria-label="O que aconteceu"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="submit" size="sm" loading={posting}>
                      Registrar
                    </Button>
                  </div>
                </form>
              ) : null}

              {timeline.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-faint">
                  Nada registrado ainda.
                </p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {timeline.map((event) => {
                    const style = EVENT_STYLE[event.type] ?? EVENT_STYLE.note;
                    const Icon = style.icon;
                    return (
                      <li key={event.id} className="flex gap-3">
                        <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-border text-faint">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="label-instrument text-muted">{style.label}</span>
                            <span className="text-xs text-faint">
                              {formatDateTime(new Date(event.createdAt))}
                              {event.userName ? ` · ${event.userName}` : ""}
                            </span>
                          </div>
                          {event.body ? (
                            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-text">
                              {event.body}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Mensagem original</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">
              {lead.message || "Sem mensagem."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anotações internas</CardTitle>
            <CardDescription>Só a equipe vê.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              disabled={!canWrite}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              aria-label="Anotações internas"
            />
            {canWrite ? (
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={savingNotes}
                  onClick={async () => {
                    setSavingNotes(true);
                    const result = await apiPatch(`/api/admin/leads/${lead.id}`, {
                      internalNotes: notes,
                    });
                    setSavingNotes(false);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Anotações salvas");
                  }}
                >
                  Salvar anotações
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <div>
              <p className="label-instrument mb-1 text-muted">Telefone</p>
              {onlyDigits(lead.phone) ? (
                <a href={`tel:${onlyDigits(lead.phone)}`} className="text-text hover:text-accent-text">
                  {formatPhone(lead.phone)}
                </a>
              ) : (
                /* lead de portal: a conversa continua lá até a pessoa passar o
                   contato, e um "tel:" vazio só daria um clique morto */
                <p className="text-muted">
                  Não informado — responda pelo portal, o link está na mensagem.
                </p>
              )}
            </div>
            {lead.email ? (
              <div>
                <p className="label-instrument mb-1 text-muted">E-mail</p>
                <a href={`mailto:${lead.email}`} className="break-all text-text hover:text-accent-text">
                  {lead.email}
                </a>
              </div>
            ) : null}
            <div>
              <p className="label-instrument mb-1 text-muted">Chegou em</p>
              <p className="text-text">{formatDateTime(new Date(lead.createdAt))}</p>
            </div>
            {lead.utm?.source ? (
              <div>
                <p className="label-instrument mb-1 text-muted">Origem da campanha</p>
                <p className="text-text">
                  {[lead.utm.source, lead.utm.medium, lead.utm.campaign].filter(Boolean).join(" · ")}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Situação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <LeadStatusBadge status={status} />
            </div>

            <FormField label="Situação" htmlFor="lead-status">
              <Select
                id="lead-status"
                disabled={!canWrite}
                value={status}
                onChange={(event) => {
                  const previous = status;
                  const next = event.target.value as LeadStatus;
                  setStatus(next);
                  void patch({ status: next }, () => setStatus(previous), "Situação atualizada");
                }}
              >
                {LEAD_STATUS.map((item) => (
                  <option key={item} value={item}>
                    {LEAD_STATUS_LABELS[item]}
                  </option>
                ))}
              </Select>
            </FormField>

            {hasFunnel && stages.length > 0 ? (
              <FormField label="Etapa do funil" htmlFor="lead-stage">
                <Select
                  id="lead-stage"
                  disabled={!canWrite}
                  value={stageId}
                  onChange={(event) => {
                    const previous = stageId;
                    const next = event.target.value;
                    setStageId(next);
                    void patch(
                      { stageId: next || null },
                      () => setStageId(previous),
                      "Etapa atualizada",
                    );
                  }}
                >
                  <option value="">Fora do funil</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}

            <FormField label="Responsável" htmlFor="lead-assignee" className="mb-0">
              <Select
                id="lead-assignee"
                disabled={!canWrite}
                value={assignee}
                onChange={(event) => {
                  const previous = assignee;
                  const next = event.target.value;
                  setAssignee(next);
                  void patch(
                    { assignedToUserId: next || null },
                    () => setAssignee(previous),
                    "Responsável atualizado",
                  );
                }}
              >
                <option value="">Sem responsável</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </CardContent>
        </Card>

        {lead.vehicleLabel || canWrite ? (
          <Card>
            <CardHeader>
              <CardTitle>Veículo</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge tone="info">{LEAD_SOURCE_LABELS[lead.source as LeadSource] ?? lead.source}</Badge>
              {canWrite ? (
                <FormField
                  label="Carro do interesse"
                  htmlFor="lead-vehicle"
                  hint={
                    lead.source === "portal"
                      ? "Vale também para os outros leads do mesmo anúncio, inclusive os próximos."
                      : undefined
                  }
                  className="mt-3"
                >
                  <Select
                    id="lead-vehicle"
                    value={vehicleId}
                    onChange={(event) => {
                      const previous = vehicleId;
                      const next = event.target.value;
                      setVehicleId(next);
                      void patch(
                        { vehicleId: next || null },
                        () => setVehicleId(previous),
                        next ? "Veículo vinculado." : "Veículo desvinculado.",
                      );
                    }}
                  >
                    <option value="">Sem veículo</option>
                    {vehicleOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : (
                <p className="mt-2 text-[13px] text-text">{lead.vehicleLabel}</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
