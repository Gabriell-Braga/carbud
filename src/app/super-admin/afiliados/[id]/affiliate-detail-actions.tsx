"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/number-field";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { AffiliateEditor, type AffiliateDraft } from "../affiliates-actions";

export function EditAffiliateButton({ affiliate }: { affiliate: AffiliateDraft }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </Button>
      {open ? <AffiliateEditor affiliate={affiliate} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Registro de dinheiro já pago fora do sistema. Nada é transferido daqui. */
export function PayoutForm({
  affiliateId,
  availableCents,
}: {
  affiliateId: string;
  availableCents: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [amountCents, setAmountCents] = useState(availableCents);
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  // uma chave por repasse: clicar de novo depois de erro de rede não registra dois
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = await confirm({
      title: "Registrar repasse realizado",
      description: `Confirme que ${formatCurrency(amountCents)} já foram pagos ao afiliado por fora. O sistema só registra, não transfere.`,
      confirmLabel: "Registrar repasse",
    });
    if (!confirmed) return;

    setSaving(true);
    setErrors({});
    const result = await apiPost<{ duplicate: boolean }>(
      `/api/super-admin/affiliates/${affiliateId}/payouts`,
      {
        amountCents,
        paidAt: new Date(`${paidAt}T12:00:00Z`).toISOString(),
        reference,
        note: note || null,
        idempotencyKey: key,
        confirmed: true,
      },
    );
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível registrar", result.error);
      return;
    }
    toast.success(result.data.duplicate ? "Repasse já estava registrado" : "Repasse registrado");
    setKey(crypto.randomUUID());
    setReference("");
    setNote("");
    router.refresh();
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Registrar repasse realizado</CardTitle>
        <CardDescription>
          Disponível agora: {formatCurrency(availableCents)}. Comissão retida por contestação não
          entra no disponível.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <FormField label="Valor repassado (R$)" htmlFor="payout-amount" error={errors.amountCents}>
              <CurrencyInput id="payout-amount" valueCents={amountCents} onChangeCents={setAmountCents} />
            </FormField>
            <FormField label="Data do pagamento" htmlFor="payout-date" error={errors.paidAt}>
              <Input
                id="payout-date"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </FormField>
            <FormField
              label="Referência"
              htmlFor="payout-reference"
              hint="Id do Pix ou da transferência."
              error={errors.reference}
            >
              <Input
                id="payout-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Observação" htmlFor="payout-note" error={errors.note}>
            <Textarea
              id="payout-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={amountCents <= 0 || !reference.trim()}>
              Registrar repasse realizado
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function VoidPayoutButton({ affiliateId, payoutId }: { affiliateId: string; payoutId: string }) {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const result = await apiPost(
      `/api/super-admin/affiliates/${affiliateId}/payouts/${payoutId}/void`,
      { reason },
    );
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível anular", result.error);
      return;
    }
    toast.success("Repasse anulado", "O valor volta para o saldo do afiliado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Anular
      </Button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Anular registro de repasse"
          description="Use quando o repasse foi lançado por engano. O registro continua no extrato, marcado como anulado."
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form={formId} variant="outlineDanger" loading={saving}>
                Anular repasse
              </Button>
            </div>
          }
        >
          <form id={formId} onSubmit={handleSubmit} noValidate>
            <FormField label="Motivo" htmlFor={`${formId}-reason`} error={errors.reason}>
              <Textarea
                id={`${formId}-reason`}
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
