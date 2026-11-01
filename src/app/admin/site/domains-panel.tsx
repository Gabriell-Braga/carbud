"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Globe, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { dnsInstructionsFor, normalizeDomain, suggestedPair } from "@/lib/integrations/domains";
import type { DnsRecord, DomainStatus } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export type DomainRow = {
  id: string;
  domain: string;
  status: DomainStatus;
  isPrimary: boolean;
  pendingRecords: DnsRecord[] | null;
  lastError: string | null;
  lastCheckedAt: string | null;
};

const TONES: Record<DomainStatus, BadgeTone> = {
  pendente: "warning",
  ativo: "success",
  erro: "danger",
};

const LABELS: Record<DomainStatus, string> = {
  pendente: "Aguardando DNS",
  ativo: "No ar",
  erro: "Com problema",
};

/** Em palavras da revenda, não do protocolo: TXT e CNAME não dizem nada a ela. */
const PURPOSE_LABELS: Record<"posse" | "apontamento", string> = {
  posse: "Provar que é seu",
  apontamento: "Trazer o site",
};

export function DomainsPanel({
  domains,
  hostingReady,
  readOnly,
}: {
  domains: DomainRow[];
  /** A hospedagem já está configurada nesta instalação? */
  hostingReady: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function check(row: DomainRow) {
    setBusyId(row.id);
    const result = await apiPost(`/api/admin/domains/${row.id}/check`);
    setBusyId(null);

    if (!result.ok) {
      toast.error("Não consegui conferir", result.error);
      return;
    }
    router.refresh();
  }

  async function makePrimary(row: DomainRow) {
    setBusyId(row.id);
    const result = await apiPatch(`/api/admin/domains/${row.id}`, { isPrimary: true });
    setBusyId(null);

    if (!result.ok) {
      toast.error("Não consegui tornar oficial", result.error);
      return;
    }
    toast.success(`${row.domain} é o endereço oficial`);
    router.refresh();
  }

  async function remove(row: DomainRow) {
    const confirmed = await confirm({
      title: "Remover endereço",
      description: `O site deixa de responder em ${row.domain}. Quem tiver o link salvo ou vier do Google cai em página de erro até apontar o DNS para outro lugar.`,
      confirmLabel: "Remover endereço",
      tone: "danger",
    });
    if (!confirmed) return;

    setBusyId(row.id);
    const result = await apiDelete(`/api/admin/domains/${row.id}`);
    setBusyId(null);

    if (!result.ok) {
      toast.error("Não consegui remover", result.error);
      return;
    }
    toast.success("Endereço removido");
    router.refresh();
  }

  return (
    <>
      {!hostingReady ? (
        <Alert tone="warning" className="mb-4">
          A hospedagem dos sites ainda não está ligada nesta instalação. Dá para ver esta tela, mas
          cadastrar endereço só depois que ela estiver configurada.
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Endereço do site</CardTitle>
            <CardDescription>
              Use o domínio da sua loja. Você cadastra aqui, cria um registro no painel onde
              comprou o domínio, e o site passa a responder nele, com certificado de segurança
              emitido automaticamente.
            </CardDescription>
          </div>
          {!readOnly ? (
            <Button
              type="button"
              className="shrink-0"
              disabled={!hostingReady}
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar endereço
            </Button>
          ) : null}
        </CardHeader>

        {domains.length === 0 ? (
          <EmptyState
            title="Nenhum endereço cadastrado"
            description="Enquanto isso o site continua no ar no endereço provisório da plataforma."
          />
        ) : (
          <CardContent className="flex flex-col gap-3">
            {domains.map((row) => (
              <DomainCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                readOnly={readOnly}
                onCheck={() => check(row)}
                onPrimary={() => makePrimary(row)}
                onRemove={() => remove(row)}
              />
            ))}
          </CardContent>
        )}
      </Card>

      {adding ? (
        <AddDomainDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function DomainCard({
  row,
  busy,
  readOnly,
  onCheck,
  onPrimary,
  onRemove,
}: {
  row: DomainRow;
  busy: boolean;
  readOnly: boolean;
  onCheck: () => void;
  onPrimary: () => void;
  onRemove: () => void;
}) {
  /*
   * Enquanto a hospedagem não respondeu uma vez, mostramos o registro que a
   * documentação da Vercel manda usar. Sem isso a tela diria "aguardando DNS"
   * sem dizer o que criar — que é justamente a informação pela qual a pessoa
   * abriu esta página.
   */
  const records = row.pendingRecords?.length ? row.pendingRecords : [dnsInstructionsFor(row.domain)];

  return (
    <div className="rounded-inner border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-faint" />
          <span className="truncate font-medium text-text">{row.domain}</span>
          <Badge tone={TONES[row.status]}>{LABELS[row.status]}</Badge>
          {row.isPrimary ? <Badge tone="info">Oficial</Badge> : null}
        </div>

        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" loading={busy} onClick={onCheck}>
              <RefreshCw className="h-3.5 w-3.5" />
              Conferir
            </Button>
            {row.status === "ativo" && !row.isPrimary ? (
              <Button type="button" variant="ghost" size="sm" onClick={onPrimary}>
                <Star className="h-3.5 w-3.5" />
                Tornar oficial
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              aria-label={`Remover ${row.domain}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      {row.lastError ? (
        <Alert tone="danger" className="mt-3">
          {row.lastError}
        </Alert>
      ) : null}

      {row.status !== "ativo" ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">
            {records.length > 1 ? "Crie os dois registros" : "Crie este registro"} no painel onde o
            domínio foi registrado (Registro.br, GoDaddy, Cloudflare…). Depois volte aqui e clique
            em Conferir.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-faint">
                  <th className="py-1 pr-3 font-medium">Para quê</th>
                  <th className="py-1 pr-3 font-medium">Tipo</th>
                  <th className="py-1 pr-3 font-medium">Nome</th>
                  <th className="py-1 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.type}-${record.name}`} className="align-middle">
                    {/*
                      Sem dizer para que serve cada um, dois registros na mesma
                      tabela parecem alternativas — e a pessoa cria só um.
                    */}
                    <td className="py-1 pr-3 text-muted">{PURPOSE_LABELS[record.purpose ?? "apontamento"]}</td>
                    <td className="py-1 pr-3 font-mono text-text">{record.type}</td>
                    <td className="py-1 pr-3 font-mono text-text">{record.name}</td>
                    <td className="py-1">
                      <CopyValue value={record.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {row.lastCheckedAt ? (
        <p className="mt-2 text-xs text-faint">
          Conferido em {formatDateTime(new Date(row.lastCheckedAt))}
        </p>
      ) : null}
    </div>
  );
}

/** O valor do registro é longo e vai ser colado noutro site — copiar é o caminho. */
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Tooltip content={copied ? "Copiado" : "Copiar"} className="min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="inline-flex max-w-full items-center gap-1.5 rounded-tag px-1.5 py-0.5 font-mono text-text transition-colors hover:bg-surface-2"
      >
        <span className="truncate">{value}</span>
        {copied ? (
          <Check className="h-3 w-3 shrink-0 text-positive" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 text-faint" />
        )}
      </button>
    </Tooltip>
  );
}

function AddDomainDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = normalizeDomain(value);
  // só reclama depois que a pessoa digitou algo que parece um endereço
  const error = value.trim().length > 3 && !parsed.ok ? parsed.reason : undefined;
  const clean = parsed.ok ? parsed.domain : null;
  const pair = clean ? suggestedPair(clean) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!clean) return;

    setSaving(true);
    const result = await apiPost("/api/admin/domains", { domain: clean });
    setSaving(false);

    if (!result.ok) {
      toast.error("Não consegui cadastrar", result.error);
      return;
    }
    toast.success(`${clean} cadastrado`, "Agora crie o registro de DNS que apareceu na tela.");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title="Adicionar endereço"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="domain-form" loading={saving} disabled={!clean}>
            Adicionar
          </Button>
        </div>
      }
    >
      <form id="domain-form" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Endereço do site"
          htmlFor="domain"
          error={error}
          hint="Pode colar com https://, que eu limpo."
        >
          <Input
            id="domain"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="suarevenda.com.br"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </FormField>

        {clean ? (
          <div className="rounded-inner border border-border bg-surface-2 px-4 py-3">
            <p className="label-instrument text-muted">Vai ser cadastrado como</p>
            <p className="font-mono text-sm text-text">{clean}</p>
            <p className="mt-2 text-xs text-faint">
              Registro necessário: <span className="font-mono">{dnsInstructionsFor(clean).type}</span>{" "}
              apontando para{" "}
              <span className="font-mono">{dnsInstructionsFor(clean).value}</span>
            </p>
          </div>
        ) : null}

        {pair ? (
          <Alert tone="info" className="mt-4">
            Depois cadastre também <span className="font-mono">{pair}</span>. Quem digita o
            endereço com e sem <span className="font-mono">www</span> precisa chegar no mesmo
            lugar. Só um dos dois cadastrado deixa metade das pessoas na página de erro.
          </Alert>
        ) : null}
      </form>
    </Dialog>
  );
}
