"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/number-field";
import { useToast } from "@/components/ui/toast";
import { formatBps, percentToBps } from "@/lib/affiliates/rules";
import { apiPatch, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";

export type AffiliateDraft = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  defaultCommissionBps: number | null;
  commissionType: "percent" | "cpa_fixed" | "cpa_first_month";
  cpaCents: number | null;
  couponId: string | null;
};

export type CouponOption = { id: string; code: string; active: boolean };

export function NewAffiliateButton({ coupons }: { coupons: CouponOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Novo afiliado
      </Button>
      {open ? (
        <AffiliateEditor
          affiliate={{
            id: "",
            name: "",
            email: null,
            phone: null,
            notes: null,
            status: "active",
            defaultCommissionBps: null,
            commissionType: "percent",
            cpaCents: null,
            couponId: null,
          }}
          coupons={coupons}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Cadastro e edição. O código não aparece aqui: o servidor gera e ninguém troca. */
export function AffiliateEditor({
  affiliate,
  coupons,
  onClose,
}: {
  affiliate: AffiliateDraft;
  coupons: CouponOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !affiliate.id;
  const [draft, setDraft] = useState(affiliate);
  // texto livre: só vira pontos-base no envio, e lá recusa precisão demais
  const [percent, setPercent] = useState(
    affiliate.defaultCommissionBps === null
      ? ""
      : formatBps(affiliate.defaultCommissionBps).replace("%", ""),
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isPercent = draft.commissionType === "percent";
    // CPA não usa percentual: vai zero para o campo, que segue obrigatório no banco
    const bps = isPercent ? percentToBps(percent) : 0;
    if (bps === null) {
      setErrors({ defaultCommissionBps: "Informe o percentual, com até duas casas decimais" });
      return;
    }

    setSaving(true);
    setErrors({});
    const payload = {
      name: draft.name,
      email: draft.email ?? "",
      phone: draft.phone,
      notes: draft.notes,
      defaultCommissionBps: bps,
      commissionType: draft.commissionType,
      cpaCents: draft.commissionType === "cpa_fixed" ? draft.cpaCents : null,
      couponId: draft.couponId,
      ...(isNew ? {} : { status: draft.status }),
    };
    const result = isNew
      ? await apiPost<{ id: string; code: string }>("/api/super-admin/affiliates", payload)
      : await apiPatch(`/api/super-admin/affiliates/${affiliate.id}`, payload);
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(isNew ? "Não foi possível cadastrar" : "Não foi possível salvar", result.error);
      return;
    }

    if (isNew) {
      const created = result.data as { id: string; code: string };
      toast.success("Afiliado cadastrado", `Código ${created.code}`);
      router.push(`/super-admin/afiliados/${created.id}`);
    } else {
      toast.success("Afiliado salvo");
      router.refresh();
    }
    onClose();
  }

  const percentChanged =
    !isNew &&
    (draft.commissionType !== affiliate.commissionType ||
      (draft.commissionType === "percent" &&
        percentToBps(percent) !== affiliate.defaultCommissionBps) ||
      (draft.commissionType === "cpa_fixed" && draft.cpaCents !== affiliate.cpaCents));

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={isNew ? "Novo afiliado" : `Editar ${affiliate.name}`}
      description={isNew ? "O código de indicação é gerado ao salvar." : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="affiliate-form" loading={saving}>
            {isNew ? "Cadastrar e gerar código" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="affiliate-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Nome" htmlFor="affiliate-name" error={errors.name}>
          <Input
            id="affiliate-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            required
          />
        </FormField>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="E-mail" htmlFor="affiliate-email" error={errors.email}>
            <Input
              id="affiliate-email"
              type="email"
              value={draft.email ?? ""}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="affiliate-phone" error={errors.phone}>
            <Input
              id="affiliate-phone"
              value={draft.phone ?? ""}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Tipo de comissão" htmlFor="affiliate-type" error={errors.commissionType}>
            <Select
              id="affiliate-type"
              value={draft.commissionType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  commissionType: event.target.value as AffiliateDraft["commissionType"],
                })
              }
            >
              <option value="percent">Percentual recorrente</option>
              <option value="cpa_fixed">CPA: valor fixo</option>
              <option value="cpa_first_month">CPA: 1ª mensalidade</option>
            </Select>
          </FormField>
          {draft.commissionType === "percent" ? (
            <FormField
              label="Comissão (%)"
              htmlFor="affiliate-percent"
              hint="Sobre cada pagamento confirmado da revenda indicada."
              error={errors.defaultCommissionBps}
            >
              <Input
                id="affiliate-percent"
                inputMode="decimal"
                placeholder="Ex.: 10"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                required
              />
            </FormField>
          ) : draft.commissionType === "cpa_fixed" ? (
            <FormField
              label="Valor do CPA (R$)"
              htmlFor="affiliate-cpa"
              hint="Pago uma vez, no primeiro pagamento da revenda indicada."
              error={errors.cpaCents}
            >
              <CurrencyInput
                id="affiliate-cpa"
                valueCents={draft.cpaCents ?? 0}
                onChangeCents={(cents) => setDraft({ ...draft, cpaCents: cents || null })}
              />
            </FormField>
          ) : (
            <p className="mb-4 self-center text-[13px] text-muted">
              Pago uma vez, no primeiro pagamento, com o valor da mensalidade do plano contratado.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {!isNew ? (
            <FormField label="Situação" htmlFor="affiliate-status" error={errors.status}>
              <Select
                id="affiliate-status"
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value as AffiliateDraft["status"] })
                }
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo (não aceita novas indicações)</option>
              </Select>
            </FormField>
          ) : null}
        </div>

        {percentChanged ? (
          <p className="mb-4 text-[13px] text-muted">
            A nova comissão vale para revendas indicadas daqui em diante. As que já estão
            vinculadas mantêm a comissão combinada na época.
          </p>
        ) : null}

        <FormField
          label="Cupom do link de indicação"
          htmlFor="affiliate-coupon"
          hint="Aplicado sozinho em quem contrata pelo link do afiliado. Ex.: primeiro mês por R$ 5."
          error={errors.couponId}
        >
          <Select
            id="affiliate-coupon"
            value={draft.couponId ?? ""}
            onChange={(event) => setDraft({ ...draft, couponId: event.target.value || null })}
          >
            <option value="">Sem cupom</option>
            {coupons
              .filter((coupon) => coupon.active || coupon.id === draft.couponId)
              .map((coupon) => (
                <option key={coupon.id} value={coupon.id}>
                  {coupon.code}
                  {coupon.active ? "" : " (inativo)"}
                </option>
              ))}
          </Select>
        </FormField>

        <FormField label="Observações" htmlFor="affiliate-notes" error={errors.notes}>
          <Textarea
            id="affiliate-notes"
            rows={2}
            value={draft.notes ?? ""}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

/** Reprocessar e, quando a base não pôde ser calculada, informá-la à mão. */
export function PendingActions({
  processingId,
  factId,
  canSetBase,
  grossCents,
}: {
  processingId: string;
  factId: string | null;
  canSetBase: boolean;
  grossCents: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const [settingBase, setSettingBase] = useState(false);

  async function handleRetry() {
    setWorking(true);
    const result = await apiPost<{ state: string; error: string | null }>(
      `/api/super-admin/affiliate-processing/${encodeURIComponent(processingId)}/retry`,
      {},
    );
    setWorking(false);
    if (!result.ok) {
      toast.error("Não foi possível reprocessar", result.error);
      return;
    }
    if (result.data.state === "done") toast.success("Apuração concluída");
    else toast.error("Ainda pendente", result.data.error ?? undefined);
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      {canSetBase && factId ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setSettingBase(true)}>
          Informar base
        </Button>
      ) : null}
      <Button type="button" variant="secondary" size="sm" loading={working} onClick={handleRetry}>
        Reprocessar
      </Button>
      {settingBase && factId ? (
        <BaseDialog
          factId={factId}
          grossCents={grossCents}
          onClose={() => setSettingBase(false)}
        />
      ) : null}
    </div>
  );
}

function BaseDialog({
  factId,
  grossCents,
  onClose,
}: {
  factId: string;
  grossCents: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [baseCents, setBaseCents] = useState(grossCents);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const result = await apiPost(`/api/super-admin/affiliate-facts/${factId}/review`, {
      baseCents,
      reason,
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível salvar", result.error);
      return;
    }
    toast.success("Base registrada", "A comissão foi apurada com esse valor.");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Informar base comissionável"
      description="Valor efetivamente pago depois de descontos, sem juros, multa nem tarifa do gateway. Confira no Asaas antes."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="fact-base-form" loading={saving}>
            Registrar base
          </Button>
        </div>
      }
    >
      <form id="fact-base-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Base (R$)" htmlFor="fact-base" error={errors.baseCents}>
          <CurrencyInput id="fact-base" valueCents={baseCents} onChangeCents={setBaseCents} />
        </FormField>
        <FormField label="Motivo" htmlFor="fact-reason" error={errors.reason}>
          <Textarea
            id="fact-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
