"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { CampaignStatus } from "@/db/schema";
import { apiPost } from "@/lib/client/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { CampaignWizard } from "./campaign-wizard";

export type CampaignRow = {
  id: string;
  name: string;
  purpose: string;
  templateName: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  createdByName: string | null;
  createdAt: string;
};

const STATUS: Record<CampaignStatus, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  draft: { label: "Pronta", tone: "neutral" },
  sending: { label: "Enviando", tone: "info" },
  done: { label: "Enviada", tone: "success" },
  canceled: { label: "Cancelada", tone: "danger" },
};

export type SendProgress = { status: string; sent: number; failed: number; skipped: number; pending: number };

/**
 * Manda lote atrás de lote até acabar.
 *
 * O servidor envia um pedaço por chamada (o Worker tem teto de chamadas
 * externas); quem repete é a tela. Fechar a aba só pausa — a campanha fica
 * "Enviando" e o botão "Continuar" retoma de onde parou.
 */
export async function runCampaign(
  id: string,
  onProgress: (progress: SendProgress) => void,
): Promise<string | null> {
  for (;;) {
    const result = await apiPost<SendProgress>(`/api/admin/campaigns/${id}/send`);
    if (!result.ok) return result.error;
    onProgress(result.data);
    if (result.data.pending === 0 || result.data.status !== "sending") return null;
  }
}

export function CampaignsPanel({
  campaigns,
  teams,
  vehicles,
  canSend,
}: {
  campaigns: CampaignRow[];
  teams: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  canSend: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  async function resume(campaign: CampaignRow) {
    setRunning(campaign.id);
    const error = await runCampaign(campaign.id, () => undefined);
    setRunning(null);
    if (error) toast.error("O envio parou", error);
    else toast.success("Campanha enviada");
    router.refresh();
  }

  async function cancel(campaign: CampaignRow) {
    const ok = await confirm({
      title: `Cancelar ${campaign.name}?`,
      description: "Quem ainda não recebeu fica sem receber. O que já foi enviado não volta.",
      confirmLabel: "Cancelar campanha",
      cancelLabel: "Voltar",
      tone: "danger",
    });
    if (!ok) return;
    const result = await apiPost(`/api/admin/campaigns/${campaign.id}/cancel`);
    if (!result.ok) {
      toast.error("Não consegui cancelar", result.error);
      return;
    }
    router.refresh();
  }

  if (creating) {
    return (
      <CampaignWizard
        teams={teams}
        vehicles={vehicles}
        onClose={() => {
          setCreating(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      {canSend ? (
        <div className="mb-3 flex justify-end">
          <Button type="button" onClick={() => setCreating(true)}>
            <Megaphone className="h-3.5 w-3.5" />
            Nova campanha
          </Button>
        </div>
      ) : null}

      <Card>
        {campaigns.length === 0 ? (
          <EmptyState
            title="Nenhuma campanha ainda"
            description="Monte uma lista pelos filtros do CRM (ex.: quem quis Kwid e não comprou) e mande um modelo aprovado pela Meta."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Campanha</Th>
                <Th>Situação</Th>
                <Th numeric>Enviadas</Th>
                <Th numeric>Falhas</Th>
                <Th numeric>Criada</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {campaigns.map((campaign) => (
                <Tr key={campaign.id}>
                  <Td>
                    <p className="font-medium text-text">{campaign.name}</p>
                    <p className="max-w-[360px] truncate text-xs text-faint" title={campaign.purpose}>
                      {campaign.templateName} · {campaign.purpose}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={STATUS[campaign.status].tone}>{STATUS[campaign.status].label}</Badge>
                  </Td>
                  <Td numeric>
                    {formatNumber(campaign.sent)} / {formatNumber(campaign.total)}
                  </Td>
                  <Td numeric>{formatNumber(campaign.failed)}</Td>
                  <Td numeric>
                    <span className="text-xs text-muted">
                      {formatDateTime(new Date(campaign.createdAt))}
                      {campaign.createdByName ? ` · ${campaign.createdByName}` : ""}
                    </span>
                  </Td>
                  <Td>
                    {canSend && (campaign.status === "draft" || campaign.status === "sending") ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={running === campaign.id}
                          onClick={() => resume(campaign)}
                        >
                          {campaign.status === "draft" ? "Enviar" : "Continuar"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => cancel(campaign)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
