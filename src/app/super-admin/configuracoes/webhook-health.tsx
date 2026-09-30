"use client";

import { useCallback, useEffect, useState } from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiPost } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

type Mark = { at: string; detail?: string } | null;

type Health = {
  configured: boolean;
  environment?: string;
  webhook?: {
    url: string;
    enabled: boolean;
    name: string;
    interrupted: boolean;
    events: string[];
  } | null;
  expectedUrl?: string;
  staleUrl?: boolean;
  missingEvents?: string[];
  connectionError?: string | null;
  lastAccepted?: Mark;
  lastRejected?: Mark;
  events?: {
    id: string;
    eventType: string;
    receivedAt: string | null;
    error: string | null;
    tenantName: string | null;
    handled: boolean;
  }[];
  diagnostico: string;
};

/** Recusa por token é a única falha que trava a fila inteira do gateway. */
function toneFor(health: Health): "info" | "warning" | "danger" | "success" {
  if (!health.configured || !health.webhook) return "warning";
  if (health.staleUrl) return "danger";
  if (!health.webhook.enabled || health.webhook.interrupted) return "danger";
  if (health.missingEvents?.length) return "danger";
  if (
    health.lastRejected &&
    (!health.lastAccepted || health.lastRejected.at > health.lastAccepted.at)
  ) {
    return "danger";
  }
  return health.events?.length ? "success" : "info";
}

export function WebhookHealth() {
  const toast = useToast();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const load = useCallback(async () => {
    const result = await apiGet<Health>("/api/super-admin/gateway");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setHealth(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needsRepair = Boolean(
    health?.webhook && (health.webhook.interrupted || health.missingEvents?.length),
  );

  async function handleResume() {
    setResuming(true);
    const result = await apiPost<{ resolvido: boolean }>("/api/super-admin/gateway");
    setResuming(false);

    if (!result.ok) {
      toast.error("Não consegui religar", result.error);
      return;
    }

    // o gateway pode ter ignorado o pedido; quem manda é o estado relido
    if (result.data.resolvido) {
      toast.success("Fila religada", "As entregas pendentes voltam a sair pelo gateway.");
    } else {
      toast.error(
        "O gateway não religou",
        "Ele aceitou o pedido mas manteve a fila parada. Precisa ser religada no painel do Asaas.",
      );
    }
    await load();
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Webhook do gateway</CardTitle>
          <CardDescription>
            É por aqui que o pagamento vira situação da revenda. Se ele parar, ninguém fica
            adimplente sozinho.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {needsRepair ? (
            <Button type="button" size="sm" loading={resuming} onClick={handleResume}>
              <PlugZap className="h-3.5 w-3.5" />
              Religar fila
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setHealth(null);
              void load();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Verificar
          </Button>
        </div>
      </CardHeader>

      {error ? (
        <CardContent>
          <Alert tone="danger">{error}</Alert>
        </CardContent>
      ) : !health ? (
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </CardContent>
      ) : (
        <>
          <CardContent className="space-y-3">
            <Alert tone={toneFor(health)}>{health.diagnostico}</Alert>

            {health.missingEvents?.length ? (
              <Alert tone="danger">
                Estes eventos não estão marcados no cadastro do webhook e por isso nunca chegam:{" "}
                {health.missingEvents.join(", ")}.
              </Alert>
            ) : null}

            {health.connectionError ? (
              <Alert tone="danger">
                Não consegui falar com o gateway: {health.connectionError}
              </Alert>
            ) : null}

            {health.webhook ? (
              <div className="grid gap-3 text-[13px] sm:grid-cols-2">
                <Line
                  label="Endereço"
                  value={<code className="text-xs">{health.webhook.url}</code>}
                />
                <Line
                  label="Estado no gateway"
                  value={
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={health.webhook.enabled ? "success" : "danger"}>
                        {health.webhook.enabled ? "Ativo" : "Desligado"}
                      </Badge>
                      {health.webhook.interrupted ? (
                        <Badge tone="danger">Fila interrompida</Badge>
                      ) : null}
                    </div>
                  }
                />
                <Line
                  label="Eventos assinados"
                  value={
                    health.webhook.events.length
                      ? `${health.webhook.events.length} evento(s)`
                      : "o gateway não informou"
                  }
                />
                <Line
                  label="Última entrega aceita"
                  value={
                    health.lastAccepted
                      ? `${formatDateTime(new Date(health.lastAccepted.at))}${health.lastAccepted.detail ? ` · ${health.lastAccepted.detail}` : ""}`
                      : "nenhuma"
                  }
                />
                <Line
                  label="Última entrega recusada"
                  value={
                    health.lastRejected ? (
                      <span className="text-danger">
                        {formatDateTime(new Date(health.lastRejected.at))}
                        {health.lastRejected.detail ? ` · ${health.lastRejected.detail}` : ""}
                      </span>
                    ) : (
                      "nenhuma"
                    )
                  }
                />
              </div>
            ) : null}
          </CardContent>

          {health.events?.length ? (
            <Table>
              <Thead>
                <Tr>
                  <Th>Evento</Th>
                  <Th>Revenda</Th>
                  <Th numeric>Recebido em</Th>
                  <Th>Resultado</Th>
                </Tr>
              </Thead>
              <tbody>
                {health.events.map((event) => (
                  <Tr key={event.id}>
                    <Td>{event.eventType}</Td>
                    <Td>{event.tenantName ?? "—"}</Td>
                    <Td numeric>
                      {event.receivedAt ? formatDateTime(new Date(event.receivedAt)) : "—"}
                    </Td>
                    <Td>
                      {event.error ? (
                        <span className="text-danger">{event.error}</span>
                      ) : event.handled ? (
                        <Badge tone="success">Processado</Badge>
                      ) : (
                        <Badge tone="neutral">Registrado, sem efeito</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              title="Nenhum evento recebido"
              description="Assim que o gateway avisar de um pagamento, ele aparece aqui."
            />
          )}
        </>
      )}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="label-instrument mb-1 text-muted">{label}</p>
      <div className="text-[13px] text-text">{value}</div>
    </div>
  );
}
