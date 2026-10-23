"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { BILLING_STATUS_LABELS } from "@/lib/catalog/labels";
import { apiPatch, apiPost } from "@/lib/client/api";
import { CurrencyInput } from "@/components/ui/number-field";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { BillingStatus } from "@/db/schema";

export type BillingPanelProps = {
  tenantId: string;
  billing: {
    status: BillingStatus;
    dueDay: number;
    graceDays: number;
    amountCents: number;
    currentDueDate: string | null;
    lastPaymentAt: string | null;
  } | null;
  /** Situação calculada considerando o vencimento (pode diferir da gravada). */
  effectiveStatus: BillingStatus;
  graceDaysLeft: number | null;
  events: {
    id: string;
    type: string;
    amountCents: number | null;
    referenceMonth: string | null;
    statusFrom: string | null;
    statusTo: string | null;
    note: string | null;
    createdByEmail: string | null;
    createdAt: string;
  }[];
};

const EVENT_LABELS: Record<string, string> = {
  payment: "Pagamento",
  status_change: "Mudança de situação",
  note: "Anotação",
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function BillingPanel({
  tenantId,
  billing,
  events,
  effectiveStatus,
  graceDaysLeft,
}: BillingPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  /**
   * Os dois campos de dinheiro saíram do FormData e viraram estado.
   *
   * O formulário lia o texto e fazia `replace(",", ".")` para converter — que
   * funciona em "1500,00" e produz NaN em "1.500,00", zerando a mensalidade em
   * silêncio. Com o valor em centavos no estado, não há conversão frágil no
   * caminho.
   */
  const [amountCents, setAmountCents] = useState(billing?.amountCents ?? 0);
  const [paymentCents, setPaymentCents] = useState(billing?.amountCents ?? 0);
  // uma por recebimento: reenviar depois de erro de rede não registra duas vezes
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());

  async function handleSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);

    const form = new FormData(event.currentTarget);
    const dueDateValue = String(form.get("currentDueDate") ?? "");

    const result = await apiPatch(`/api/super-admin/tenants/${tenantId}/billing`, {
      status: String(form.get("status") ?? ""),
      dueDay: Number(form.get("dueDay") ?? 10),
      graceDays: Number(form.get("graceDays") ?? 5),
      amountCents,
      currentDueDate: dueDateValue ? new Date(`${dueDateValue}T12:00:00Z`).toISOString() : null,
      note: String(form.get("note") ?? ""),
    });

    setSavingSettings(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Situação da assinatura atualizada.");
    router.refresh();
  }

  async function handlePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPayment(true);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await apiPost(`/api/super-admin/tenants/${tenantId}/billing`, {
      amountCents: paymentCents,
      referenceMonth: String(form.get("referenceMonth") ?? currentMonth()),
      note: String(form.get("paymentNote") ?? ""),
      markAsPaid: form.get("markAsPaid") === "on",
      idempotencyKey: paymentKey,
    });

    setSavingPayment(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    formElement.reset();
    setPaymentKey(crypto.randomUUID());
    toast.success("Pagamento registrado.");
    router.refresh();
  }

  const dueDateInput = billing?.currentDueDate
    ? new Date(billing.currentDueDate).toISOString().slice(0, 10)
    : "";

  const drifted = billing !== null && effectiveStatus !== billing.status;

  return (
    <div className="flex flex-col gap-4">
      {drifted ? (
        <Alert tone={effectiveStatus === "suspenso" ? "danger" : "warning"}>
          Pelo vencimento, esta revenda já conta como{" "}
          <strong className="font-medium">{BILLING_STATUS_LABELS[effectiveStatus]}</strong>, e o
          bloqueio já está valendo. O registro só será atualizado no próximo giro da régua de
          cobrança.
        </Alert>
      ) : null}

      {graceDaysLeft !== null && !drifted ? (
        <Alert tone="warning">
          Vencimento em atraso. Suspensão automática em{" "}
          <strong className="font-medium">{graceDaysLeft} dia(s)</strong>.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cobrança e vencimento</CardTitle>
            <CardDescription>
              Marcar como suspensa tira o site do ar e restringe o painel da revenda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSettings}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <FormField label="Situação" htmlFor="status">
                  <Select id="status" name="status" defaultValue={billing?.status ?? "adimplente"}>
                    {Object.entries(BILLING_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Mensalidade (R$)" htmlFor="amount">
                  <CurrencyInput
                    id="amount"
                    valueCents={amountCents}
                    onChangeCents={setAmountCents}
                  />
                </FormField>

                <FormField label="Dia do vencimento" htmlFor="dueDay">
                  <Select id="dueDay" name="dueDay" defaultValue={String(billing?.dueDay ?? 10)}>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        Dia {day}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField
                  label="Tolerância (dias)"
                  htmlFor="graceDays"
                  hint="Dias após o vencimento até a suspensão automática"
                >
                  <Input
                    id="graceDays"
                    name="graceDays"
                    type="number"
                    min={0}
                    max={60}
                    defaultValue={billing?.graceDays ?? 5}
                  />
                </FormField>

                <FormField label="Próximo vencimento" htmlFor="currentDueDate">
                  <Input
                    id="currentDueDate"
                    name="currentDueDate"
                    type="date"
                    defaultValue={dueDateInput}
                  />
                </FormField>
              </div>

              <FormField label="Observação para o histórico" htmlFor="note">
                <Textarea id="note" name="note" rows={2} />
              </FormField>

              <Button type="submit" loading={savingSettings}>
                Salvar situação
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registrar pagamento</CardTitle>
            <CardDescription>
              {billing?.lastPaymentAt
                ? `Último pagamento em ${formatDateTime(new Date(billing.lastPaymentAt))}.`
                : "Nenhum pagamento registrado ainda."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePayment}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <FormField label="Valor recebido (R$)" htmlFor="paymentAmount">
                  <CurrencyInput
                    id="paymentAmount"
                    valueCents={paymentCents}
                    onChangeCents={setPaymentCents}
                    required
                  />
                </FormField>

                <FormField label="Competência" htmlFor="referenceMonth" hint="Formato AAAA-MM">
                  <Input
                    id="referenceMonth"
                    name="referenceMonth"
                    defaultValue={currentMonth()}
                    pattern="\d{4}-\d{2}"
                    required
                  />
                </FormField>
              </div>

              <FormField label="Observação" htmlFor="paymentNote">
                <Input id="paymentNote" name="paymentNote" placeholder="PIX, boleto…" />
              </FormField>

              <label className="mb-4 flex items-center gap-2 text-[13px] text-muted">
                <Checkbox name="markAsPaid" defaultChecked />
                Marcar como adimplente e reativar o site
              </label>

              <Button type="submit" loading={savingPayment}>
                Registrar pagamento
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico financeiro</CardTitle>
        </CardHeader>
        {events.length === 0 ? (
          <EmptyState
            title="Sem movimentações"
            description="Pagamentos e mudanças de situação aparecem aqui."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th numeric>Data</Th>
                <Th>Tipo</Th>
                <Th numeric>Valor</Th>
                <Th numeric>Competência</Th>
                <Th>Detalhe</Th>
                <Th>Responsável</Th>
              </Tr>
            </Thead>
            <tbody>
              {events.map((item) => (
                <Tr key={item.id}>
                  <Td numeric className="whitespace-nowrap text-muted">
                    {formatDateTime(new Date(item.createdAt))}
                  </Td>
                  <Td>{EVENT_LABELS[item.type] ?? item.type}</Td>
                  <Td numeric>
                    {item.amountCents !== null ? formatCurrency(item.amountCents) : "—"}
                  </Td>
                  <Td numeric className="text-muted">
                    {item.referenceMonth ?? "—"}
                  </Td>
                  <Td className="max-w-64 text-xs text-muted">
                    {item.statusFrom || item.statusTo ? (
                      <span className="mr-2 text-faint">
                        {item.statusFrom ?? "—"} → {item.statusTo ?? "—"}
                      </span>
                    ) : null}
                    {item.note}
                  </Td>
                  <Td className="text-xs text-faint">{item.createdByEmail ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
