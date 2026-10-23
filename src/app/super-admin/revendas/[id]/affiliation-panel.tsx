"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatBps } from "@/lib/affiliates/rules";
import { apiPatch, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

export type AffiliationSummary = {
  affiliateId: string;
  affiliateName: string;
  code: string;
  commissionBps: number;
  attributedAt: string;
  source: string;
};

const SOURCE_LABELS: Record<string, string> = {
  tenant_create: "no cadastro",
  subscription: "na contratação",
  admin: "por correção administrativa",
};

/** Origem da revenda. Trocar é correção com motivo, e só antes da primeira comissão. */
export function AffiliationPanel({
  tenantId,
  affiliation,
}: {
  tenantId: string;
  affiliation: AffiliationSummary | null;
}) {
  const [correcting, setCorrecting] = useState(false);

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Afiliado de origem</CardTitle>
          <CardDescription>
            Quem indicou esta revenda. A comissão é sobre cada pagamento confirmado, com o
            percentual fixado no vínculo.
          </CardDescription>
        </div>
        <Button type="button" variant="secondary" className="shrink-0" onClick={() => setCorrecting(true)}>
          {affiliation ? "Corrigir origem" : "Informar origem"}
        </Button>
      </CardHeader>
      <CardContent>
        {affiliation ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Afiliado"
              value={
                <Link
                  href={`/super-admin/afiliados/${affiliation.affiliateId}`}
                  className="hover:underline"
                >
                  {affiliation.affiliateName}
                </Link>
              }
            />
            <Field label="Código" value={<span className="font-mono">{affiliation.code}</span>} />
            <Field
              label="Indicada em"
              value={`${formatDate(new Date(affiliation.attributedAt))} ${SOURCE_LABELS[affiliation.source] ?? ""}`}
            />
            <Field label="Percentual fixado" value={formatBps(affiliation.commissionBps)} />
          </div>
        ) : (
          <p className="text-[13px] text-muted">Venda direta: nenhum afiliado registrado.</p>
        )}
      </CardContent>

      {correcting ? (
        <CorrectionDialog
          tenantId={tenantId}
          current={affiliation}
          onClose={() => setCorrecting(false)}
        />
      ) : null}
    </Card>
  );
}

function CorrectionDialog({
  tenantId,
  current,
  onClose,
}: {
  tenantId: string;
  current: AffiliationSummary | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState(current?.code ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const result = await apiPatch(`/api/super-admin/tenants/${tenantId}/affiliation`, {
      affiliateCode: code.trim() || null,
      reason,
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível salvar", result.error);
      return;
    }
    toast.success("Origem atualizada");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={current ? "Corrigir afiliado de origem" : "Informar afiliado de origem"}
      description="Vale só para pagamentos a partir de agora: nada é calculado para trás. Depois da primeira comissão, a origem não pode mais ser trocada."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="affiliation-form" loading={saving}>
            Salvar
          </Button>
        </div>
      }
    >
      <form id="affiliation-form" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Código do afiliado"
          htmlFor="affiliation-code"
          hint={current ? "Vazio remove a origem." : undefined}
          error={errors.affiliateCode}
        >
          <Input
            id="affiliation-code"
            value={code}
            placeholder="AF-..."
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </FormField>
        <FormField label="Motivo" htmlFor="affiliation-reason" error={errors.reason}>
          <Textarea
            id="affiliation-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="label-instrument mb-1 text-muted">{label}</p>
      <div className="text-[13px] text-text">{value}</div>
    </div>
  );
}
