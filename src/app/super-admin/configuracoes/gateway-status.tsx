"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client/api";

type Environment = "sandbox" | "production";
type Configured = Record<Environment, { webhookToken: boolean } | null>;

const NAMES: Record<Environment, string> = { production: "Produção", sandbox: "Sandbox" };
const KEY_VARS: Record<Environment, string> = {
  production: "ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN",
  sandbox: "ASAAS_SANDBOX_API_KEY e ASAAS_SANDBOX_WEBHOOK_TOKEN",
};

/**
 * Qual ambiente do Asaas recebe as contratações novas.
 *
 * As chaves continuam nas variáveis secretas e não aparecem aqui; a chave
 * seletora só escolhe entre as que existem. Assinatura já criada segue no
 * ambiente em que nasceu, e o webhook dos dois ambientes continua sendo
 * processado — trocar não perde evento de ninguém.
 */
export function GatewayStatus({
  active,
  configured,
}: {
  active: Environment;
  configured: Configured;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const labelId = useId();
  const [saving, setSaving] = useState(false);

  async function change(sandbox: boolean) {
    const next: Environment = sandbox ? "sandbox" : "production";
    const confirmed = await confirm(
      next === "sandbox"
        ? {
            title: "Ligar o sandbox",
            description:
              "Contratações feitas a partir de agora vão para o ambiente de teste do Asaas e não geram cobrança real. Assinaturas que já existem continuam onde estão.",
            confirmLabel: "Ligar sandbox",
          }
        : {
            title: "Voltar para produção",
            description:
              "Contratações feitas a partir de agora geram cobrança real. Assinaturas criadas no sandbox continuam no sandbox.",
            confirmLabel: "Usar produção",
          },
    );
    if (!confirmed) return;

    setSaving(true);
    const result = await apiPatch("/api/super-admin/gateway", { environment: next });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não foi possível trocar", result.error);
      return;
    }
    toast.success(`Ambiente: ${NAMES[next]}`);
    router.refresh();
  }

  const current = configured[active];

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Gateway de pagamento</CardTitle>
        <CardDescription>
          As chaves e os tokens do webhook ficam nas variáveis secretas do Webflow Cloud e não
          aparecem aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={active === "production" ? "success" : "info"}>{NAMES[active]}</Badge>
          <p className="text-[13px] text-muted">
            {active === "production"
              ? "Contratações novas geram cobrança real."
              : "Contratações novas são de teste e não geram dinheiro."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={active === "sandbox"}
            onChange={change}
            disabled={saving || !configured[active === "sandbox" ? "production" : "sandbox"]}
            aria-labelledby={labelId}
          />
          <span id={labelId} className="text-[13px] text-text">
            Modo sandbox (testes)
          </span>
        </div>

        {!current ? (
          <Alert tone="warning">
            O ambiente ativo não tem chave. Contratações em planos automáticos vão falhar até
            cadastrar {KEY_VARS[active]}.
          </Alert>
        ) : !current.webhookToken ? (
          <Alert tone="warning">
            Falta o token do webhook deste ambiente: as entregas do Asaas vão ser recusadas.
          </Alert>
        ) : null}

        <ul className="space-y-1 text-[13px] text-muted">
          {(["production", "sandbox"] as const).map((environment) => (
            <li key={environment}>
              {NAMES[environment]}:{" "}
              {configured[environment]
                ? configured[environment]!.webhookToken
                  ? "chave e token configurados"
                  : "chave configurada, sem token de webhook"
                : `sem chave (${KEY_VARS[environment]})`}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
