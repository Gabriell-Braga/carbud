import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireSuperAdminPage } from "@/lib/auth/guards";
import { formatBps } from "@/lib/affiliates/rules";
import { listAffiliatesWithTotals, listPendingProcessing } from "@/lib/services/affiliates";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import { NewAffiliateButton, PendingActions } from "./affiliates-actions";

export const metadata: Metadata = { title: "Afiliados" };
export const dynamic = "force-dynamic";

const STATE_LABELS: Record<string, string> = {
  pending: "Pendente",
  failed: "Falhou",
  review: "Em revisão",
};

export default async function AffiliatesPage() {
  await requireSuperAdminPage();
  const [rows, pending] = await Promise.all([listAffiliatesWithTotals(), listPendingProcessing()]);

  return (
    <>
      <PageHeader
        title="Afiliados"
        description="Quem indica revendas, quanto ganha sobre cada pagamento confirmado e o que já foi repassado."
        actions={<NewAffiliateButton />}
      />

      {pending.length > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Pagamentos para conferir</CardTitle>
            <CardDescription>
              Eventos que a apuração não conseguiu fechar sozinha. Enquanto estiverem aqui, a
              comissão deles não entra nos números.
            </CardDescription>
          </CardHeader>
          <Table>
            <Thead>
              <Tr>
                <Th>Pagamento</Th>
                <Th>Evento</Th>
                <Th>Situação</Th>
                <Th>Motivo</Th>
                <Th numeric>Tentativas</Th>
                <Th numeric>Atualizado</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {pending.map(({ processing, fact }) => (
                <Tr key={processing.id}>
                  <Td>
                    <div className="font-medium text-text">
                      {processing.sourcePaymentId ?? fact?.sourcePaymentId ?? "—"}
                    </div>
                    {fact ? (
                      <div className="text-xs text-faint">
                        {formatCurrency(fact.grossCents)} · {fact.gatewayStatus}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{processing.eventType ?? (processing.source === "manual" ? "Recebimento manual" : "—")}</Td>
                  <Td>
                    <Badge tone={processing.state === "failed" ? "danger" : "warning"}>
                      {STATE_LABELS[processing.state] ?? processing.state}
                    </Badge>
                  </Td>
                  <Td className="max-w-xs whitespace-normal text-[13px]">{processing.lastError ?? "—"}</Td>
                  <Td numeric>{processing.attempts}</Td>
                  <Td numeric>{formatDateTime(processing.updatedAt)}</Td>
                  <Td>
                    <PendingActions
                      processingId={processing.id}
                      factId={fact?.id ?? null}
                      canSetBase={processing.state === "review" && Boolean(fact?.tenantId)}
                      grossCents={fact?.grossCents ?? 0}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhum afiliado"
            description="Cadastre um afiliado para gerar o código que ele passa às revendas."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Afiliado</Th>
                <Th>Situação</Th>
                <Th numeric>Comissão</Th>
                <Th numeric>Indicadas</Th>
                <Th numeric>Convertidas</Th>
                <Th numeric>Comissão líquida</Th>
                <Th numeric>Repassado</Th>
                <Th numeric>Saldo</Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.map(({ affiliate, totals }) => (
                <Tr key={affiliate.id}>
                  <Td>
                    <Link
                      href={`/super-admin/afiliados/${affiliate.id}`}
                      className="font-medium text-text hover:underline"
                    >
                      {affiliate.name}
                    </Link>
                    <div className="font-mono text-xs text-faint">{affiliate.code}</div>
                  </Td>
                  <Td>
                    <Badge tone={affiliate.status === "active" ? "success" : "neutral"}>
                      {affiliate.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </Td>
                  <Td numeric>{formatBps(affiliate.defaultCommissionBps)}</Td>
                  <Td numeric>{formatNumber(totals.referred)}</Td>
                  <Td numeric>{formatNumber(totals.converted)}</Td>
                  <Td numeric>{formatCurrency(totals.netCents)}</Td>
                  <Td numeric>{formatCurrency(totals.paidOutCents)}</Td>
                  <Td numeric>{formatCurrency(totals.balanceCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
