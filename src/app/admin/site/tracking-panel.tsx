"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { apiPatch, apiPost, errorMessageFrom, fieldErrorsFrom } from "@/lib/client/api";

export type TrackingValues = {
  metaPixelId: string;
  metaPageId: string;
  ga4MeasurementId: string;
  googleAdsId: string;
  googleAdsLeadLabel: string;
  googleAdsSaleLabel: string;
  serverSide: boolean;
};

export type TrackingSecretsState = {
  /** Só se existe: o valor nunca volta do servidor. */
  metaAccessToken: boolean;
  ga4ApiSecret: boolean;
};

type TestResult = {
  meta?: { ok: boolean; error?: string };
  ga4?: { ok: boolean; error?: string };
};

/**
 * Conectores de mídia da revenda, num lugar só.
 *
 * A loja cola quatro ids e liga uma chave. O que acontece depois:
 *
 * - **No navegador**, o site passa a carregar o pixel da Meta, o GA4 e a tag
 *   do Google Ads, e dispara visita à ficha e envio de formulário.
 * - **No servidor**, as mesmas conversões saem de novo pela API de Conversões
 *   e pelo Measurement Protocol — o que sobrevive a bloqueador de anúncio e é
 *   o único caminho possível para a VENDA, que acontece dias depois e dentro
 *   do painel.
 *
 * Os dois lados mandam o mesmo id de evento, então a conversão conta uma vez.
 */
export function TrackingPanel({
  initial,
  secrets,
  vaultReady,
  readOnly,
}: {
  initial: TrackingValues;
  secrets: TrackingSecretsState;
  vaultReady: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState(initial);
  const [metaToken, setMetaToken] = useState("");
  const [ga4Secret, setGa4Secret] = useState("");
  const [saved, setSaved] = useState(secrets);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  function update<K extends keyof TrackingValues>(key: K, value: TrackingValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErrors({});

    const result = await apiPatch("/api/admin/site/tracking", {
      ...values,
      ...(metaToken ? { metaAccessToken: metaToken } : {}),
      ...(ga4Secret ? { ga4ApiSecret: ga4Secret } : {}),
      ...extra,
    });

    setBusy(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não consegui salvar", errorMessageFrom(result));
      return;
    }

    setSaved({
      metaAccessToken: extra.clearMetaAccessToken
        ? false
        : saved.metaAccessToken || Boolean(metaToken),
      ga4ApiSecret: extra.clearGa4ApiSecret ? false : saved.ga4ApiSecret || Boolean(ga4Secret),
    });
    setMetaToken("");
    setGa4Secret("");
    setTest(null);
    toast.success("Conectores salvos", "O site passa a medir na próxima visita.");
    router.refresh();
  }

  async function handleTest() {
    setTesting(true);
    const result = await apiPost<TestResult>("/api/admin/site/tracking", {});
    setTesting(false);

    if (!result.ok) {
      toast.error("Não consegui testar", result.error);
      return;
    }
    setTest(result.data);
  }

  const disabled = readOnly || busy;

  return (
    <div className="flex flex-col gap-4">
      {!vaultReady ? (
        <Alert tone="danger">
          O cofre de credenciais não está configurado nesta instalação. Dá para salvar os ids
          públicos, mas não o token da Meta nem o segredo do GA4 — guardar token de terceiro sem
          cifra não é uma opção.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Meta (Facebook e Instagram)</CardTitle>
          <CardDescription>
            O pixel mede no navegador. O token da API de Conversões faz a mesma conversão sair
            também do servidor — é o que continua contando quando o navegador bloqueia o pixel, e
            é o único caminho para a venda, que acontece aqui dentro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Id do pixel"
              htmlFor="metaPixelId"
              hint="Gerenciador de Eventos → Fontes de dados"
              error={errors.metaPixelId}
            >
              <Input
                id="metaPixelId"
                value={values.metaPixelId}
                disabled={disabled}
                placeholder="1234567890123456"
                onChange={(event) => update("metaPixelId", event.target.value.trim())}
              />
            </FormField>

            <FormField
              label="Id da página do Facebook"
              htmlFor="metaPageId"
              hint="Usado pelo catálogo de veículos (Integrações → Feed de estoque)"
              error={errors.metaPageId}
            >
              <Input
                id="metaPageId"
                value={values.metaPageId}
                disabled={disabled}
                placeholder="130076683675838"
                onChange={(event) => update("metaPageId", event.target.value.trim())}
              />
            </FormField>

            <FormField
              label="Token da API de Conversões"
              htmlFor="metaAccessToken"
              hint={
                saved.metaAccessToken
                  ? "Guardado. Preencha só para trocar."
                  : "Gerenciador de Eventos → Configurações → Gerar token"
              }
              error={errors.metaAccessToken}
            >
              <div className="flex items-center gap-2">
                <PasswordInput
                  id="metaAccessToken"
                  value={metaToken}
                  disabled={disabled || !vaultReady}
                  autoComplete="off"
                  placeholder={saved.metaAccessToken ? "••••••••" : "EAAG..."}
                  onChange={(event) => setMetaToken(event.target.value)}
                />
                {saved.metaAccessToken ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover token da Meta"
                    disabled={disabled}
                    onClick={() => save({ clearMetaAccessToken: true })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Analytics 4</CardTitle>
          <CardDescription>
            O id de medição liga o GA no site. O api_secret permite mandar lead e venda pelo
            servidor, que é como a venda entra no GA ao lado da campanha que a trouxe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Id de medição"
              htmlFor="ga4MeasurementId"
              hint="Admin → Fluxos de dados"
              error={errors.ga4MeasurementId}
            >
              <Input
                id="ga4MeasurementId"
                value={values.ga4MeasurementId}
                disabled={disabled}
                placeholder="G-XXXXXXXXXX"
                onChange={(event) => update("ga4MeasurementId", event.target.value.toUpperCase())}
              />
            </FormField>

            <FormField
              label="api_secret do Measurement Protocol"
              htmlFor="ga4ApiSecret"
              hint={
                saved.ga4ApiSecret
                  ? "Guardado. Preencha só para trocar."
                  : "Fluxo de dados → Measurement Protocol"
              }
              error={errors.ga4ApiSecret}
            >
              <div className="flex items-center gap-2">
                <PasswordInput
                  id="ga4ApiSecret"
                  value={ga4Secret}
                  disabled={disabled || !vaultReady}
                  autoComplete="off"
                  placeholder={saved.ga4ApiSecret ? "••••••••" : ""}
                  onChange={(event) => setGa4Secret(event.target.value)}
                />
                {saved.ga4ApiSecret ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover segredo do GA4"
                    disabled={disabled}
                    onClick={() => save({ clearGa4ApiSecret: true })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Ads</CardTitle>
          <CardDescription>
            O rótulo é o trecho depois da barra no snippet da conversão
            (<code className="text-xs">AW-123/AbC-D_efGh</code> → <code className="text-xs">AbC-D_efGh</code>).
            Um para lead, outro para venda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <FormField label="Id da conta" htmlFor="googleAdsId" error={errors.googleAdsId}>
              <Input
                id="googleAdsId"
                value={values.googleAdsId}
                disabled={disabled}
                placeholder="AW-123456789"
                onChange={(event) => update("googleAdsId", event.target.value.toUpperCase())}
              />
            </FormField>
            <FormField
              label="Rótulo do lead"
              htmlFor="googleAdsLeadLabel"
              error={errors.googleAdsLeadLabel}
            >
              <Input
                id="googleAdsLeadLabel"
                value={values.googleAdsLeadLabel}
                disabled={disabled}
                onChange={(event) => update("googleAdsLeadLabel", event.target.value.trim())}
              />
            </FormField>
            <FormField
              label="Rótulo da venda"
              htmlFor="googleAdsSaleLabel"
              error={errors.googleAdsSaleLabel}
            >
              <Input
                id="googleAdsSaleLabel"
                value={values.googleAdsSaleLabel}
                disabled={disabled}
                onChange={(event) => update("googleAdsSaleLabel", event.target.value.trim())}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Envio pelo servidor</CardTitle>
          <CardDescription>
            Manda lead e venda direto para a Meta e para o Google, além do navegador. O mesmo id
            de evento vai nos dois lados, então a conversão não conta em dobro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-2 text-[13px] text-text">
            <Checkbox
              checked={values.serverSide}
              disabled={disabled}
              onChange={(event) => update("serverSide", event.target.checked)}
            />
            <span>
              Ligar o envio pelo servidor
              <span className="mt-0.5 block text-xs text-faint">
                Precisa do token da Meta e/ou do api_secret do GA4 acima.
              </span>
            </span>
          </label>

          {test ? (
            <div className="mt-3 flex flex-col gap-2">
              {test.meta ? (
                <Alert tone={test.meta.ok ? "success" : "danger"}>
                  Meta: {test.meta.ok ? "evento de teste aceito." : test.meta.error}
                </Alert>
              ) : null}
              {test.ga4 ? (
                <Alert tone={test.ga4.ok ? "success" : "danger"}>
                  GA4: {test.ga4.ok ? "evento de teste entregue." : test.ga4.error}
                </Alert>
              ) : null}
              {test.ga4?.ok ? (
                <p className="text-xs text-faint">
                  O Google aceita sem validar o conteúdo: confira em Tempo real, no GA, se o
                  evento apareceu.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" loading={busy} onClick={() => save()}>
            Salvar conectores
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={testing}
            disabled={!values.serverSide}
            onClick={handleTest}
          >
            <Activity className="h-3.5 w-3.5" />
            Enviar evento de teste
          </Button>
          <Status values={values} secrets={saved} />
        </div>
      ) : null}
    </div>
  );
}

/** Um resumo do que está de pé, para não precisar reler os quatro cards. */
function Status({
  values,
  secrets,
}: {
  values: TrackingValues;
  secrets: TrackingSecretsState;
}) {
  const active = [
    values.metaPixelId ? "Pixel" : null,
    values.serverSide && secrets.metaAccessToken ? "CAPI" : null,
    values.ga4MeasurementId ? "GA4" : null,
    values.serverSide && secrets.ga4ApiSecret ? "GA4 servidor" : null,
    values.googleAdsId ? "Ads" : null,
  ].filter(Boolean) as string[];

  if (active.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-2 self-center">
      <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
      {active.map((item) => (
        <Badge key={item} tone="neutral">
          {item}
        </Badge>
      ))}
    </span>
  );
}
