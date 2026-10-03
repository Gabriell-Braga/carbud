"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpToLine, ExternalLink, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/field";
import { SelectMenu, type SelectOption } from "@/components/ui/select-menu";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client/api";
import { PUBLICATION_LABELS, type PublicationStatus } from "@/lib/integrations/portals";
import type { AdTypesInfo, Quota } from "@/lib/services/portal-ad-types";
import { formatDateTime } from "@/lib/utils";

type Listing = {
  id: string;
  vehicleId: string;
  vehicle: string;
  version: string | null;
  yearModel: number;
  vehicleStatus: string;
  status: PublicationStatus;
  /** Erro do portal (status erro) ou nota de situação (publicado mas não no ar). */
  detail: string | null;
  url: string | null;
  syncedAt: string | null;
  /** Tipo pedido para este carro (null = padrão da loja). */
  listingType: string | null;
  /** Tipo que o portal confirmou. */
  appliedListingType: string | null;
  highlightedAt: string | null;
  nextHighlights: string[];
  /** OLX: só anúncio aprovado (com id da OLX) pode ser destacado. */
  canHighlight: boolean;
};

const TONE: Record<PublicationStatus, BadgeTone> = {
  publicado: "success",
  pendente: "info",
  removendo: "warning",
  removido: "neutral",
  erro: "danger",
};

/** Ordem de leitura: o que precisa de ação primeiro, o que já passou por último. */
const ORDER: PublicationStatus[] = ["erro", "pendente", "removendo", "publicado", "removido"];

/** Valor do seletor que significa "seguir o padrão" (o SelectMenu não aceita vazio como opção). */
const DEFAULT_VALUE = "__padrao__";

export function ListingsPanel({
  portalKey,
  portalName,
  connected,
  canWrite,
  connectionError,
  lastSyncAt,
  adTypes,
  listings,
}: {
  portalKey: string;
  portalName: string;
  connected: boolean;
  canWrite: boolean;
  connectionError: string | null;
  lastSyncAt: string | null;
  adTypes: AdTypesInfo | null;
  listings: Listing[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PublicationStatus | "todos">("todos");

  const counts = ORDER.map((item) => ({
    status: item,
    total: listings.filter((listing) => listing.status === item).length,
  })).filter((item) => item.total > 0);

  const sorted = useMemo(() => {
    const term = query.trim().toLowerCase();
    return listings
      .filter((listing) => status === "todos" || listing.status === status)
      .filter(
        (listing) =>
          !term ||
          `${listing.vehicle} ${listing.version ?? ""} ${listing.yearModel} ${listing.detail ?? ""}`
            .toLowerCase()
            .includes(term),
      )
      .sort(
        (a, b) =>
          ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.vehicle.localeCompare(b.vehicle),
      );
  }, [listings, query, status]);

  const typeNames = new Map(
    adTypes?.mode === "plan" ? adTypes.options.map((option) => [option.id, option.name]) : [],
  );

  return (
    <div className="space-y-4">
      {connectionError ? <Alert tone="danger">{connectionError}</Alert> : null}

      {adTypes ? (
        <AdTypesCard
          portalKey={portalKey}
          portalName={portalName}
          canWrite={canWrite}
          info={adTypes}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Anúncios</CardTitle>
          <CardDescription>
            {lastSyncAt
              ? `Última sincronização em ${formatDateTime(new Date(lastSyncAt))}.`
              : "Ainda não sincronizado."}
          </CardDescription>
        </CardHeader>

        {listings.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            {/* os contadores são os filtros: ver "18 erro" e clicar nele é o gesto natural */}
            <FilterChip active={status === "todos"} onClick={() => setStatus("todos")}>
              Todos ({listings.length})
            </FilterChip>
            {counts.map((item) => (
              <FilterChip
                key={item.status}
                active={status === item.status}
                tone={TONE[item.status]}
                onClick={() => setStatus(status === item.status ? "todos" : item.status)}
              >
                {PUBLICATION_LABELS[item.status]} ({item.total})
              </FilterChip>
            ))}
            <div className="relative ml-auto min-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Marca, modelo, versão ou motivo"
                className="pl-8"
                aria-label="Buscar anúncio"
              />
            </div>
          </div>
        ) : null}

        <CardContent className="p-0">
          {listings.length === 0 ? (
            <EmptyState
              title={connected ? "Nenhum carro enviado ainda" : `${portalName} não está conectado`}
              description={
                connected
                  ? "Clique em Sincronizar agora para enviar o estoque."
                  : "Conecte a conta em Portais para começar."
              }
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              title="Nada com esse filtro"
              description="Limpe a busca ou escolha outra situação."
            />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Veículo</Th>
                  <Th>Situação</Th>
                  {adTypes?.mode === "plan" ? <Th>Tipo de anúncio</Th> : null}
                  {adTypes?.mode === "bump" ? <Th>Destaque</Th> : null}
                  <Th>Detalhe</Th>
                  <Th>Atualizado</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {sorted.map((listing) => (
                  <Tr key={listing.id}>
                    <Td>
                      <Link
                        href={`/admin/estoque/${listing.vehicleId}`}
                        className="font-medium text-text transition-colors hover:text-accent-text"
                      >
                        {listing.vehicle} {listing.yearModel}
                      </Link>
                      {listing.version ? (
                        <p className="truncate text-xs text-faint">{listing.version}</p>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={TONE[listing.status]}>
                        {PUBLICATION_LABELS[listing.status]}
                      </Badge>
                    </Td>
                    {adTypes?.mode === "plan" ? (
                      <Td className="min-w-44">
                        <ListingTypeCell
                          portalKey={portalKey}
                          listing={listing}
                          info={adTypes}
                          names={typeNames}
                          disabled={!canWrite || listing.status === "removido"}
                        />
                      </Td>
                    ) : null}
                    {adTypes?.mode === "bump" ? (
                      <Td className="whitespace-nowrap">
                        <HighlightCell
                          portalKey={portalKey}
                          listing={listing}
                          canWrite={canWrite}
                        />
                      </Td>
                    ) : null}
                    <Td className="max-w-md">
                      {listing.detail ? (
                        <p
                          className={
                            listing.status === "erro"
                              ? "text-[13px] text-danger"
                              : "text-[13px] text-muted"
                          }
                        >
                          {listing.detail}
                        </p>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {listing.syncedAt ? formatDateTime(new Date(listing.syncedAt)) : "—"}
                    </Td>
                    <Td className="text-right">
                      {listing.url ? (
                        <a
                          href={listing.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-accent-text hover:underline"
                        >
                          Abrir no portal
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const CHIP_ACTIVE: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface-2 text-text",
  success: "border-positive/40 bg-positive-soft text-positive",
  warning: "border-warning/40 bg-warning-soft text-warning",
  danger: "border-danger/40 bg-danger-soft text-danger",
  info: "border-accent/30 bg-accent-soft text-accent-text",
};

function FilterChip({
  active,
  tone = "neutral",
  onClick,
  children,
}: {
  active: boolean;
  tone?: BadgeTone;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "inline-flex h-7 items-center rounded-full border px-3 text-[13px] transition-colors " +
        (active ? CHIP_ACTIVE[tone] : "border-border text-muted hover:bg-surface-2 hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function quotaLabel(quota: Quota | undefined): string {
  return quota ? `${quota.used} de ${quota.total} em uso` : "";
}

/* ------------------------------------------------------------------------ */
/* Painel de tipos                                                           */
/* ------------------------------------------------------------------------ */

/**
 * O plano da loja no portal, num painel só: o tipo padrão e quanto de cada
 * tipo já está em uso (Webmotors, ML), ou as vagas e o saldo de destaques
 * (OLX). É o que a loja precisa ver antes de pôr um carro em destaque.
 */
function AdTypesCard({
  portalKey,
  portalName,
  canWrite,
  info,
}: {
  portalKey: string;
  portalName: string;
  canWrite: boolean;
  info: AdTypesInfo;
}) {
  if (info.mode === "bump") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plano e destaques</CardTitle>
          <CardDescription>
            Destacar leva o anúncio de volta ao topo da busca da {portalName}, e o plano agenda as
            próximas voltas para a semana. Cada destaque gasta saldo — por isso só acontece quando
            você clica, na linha do carro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {info.error ? (
            <p className="text-sm text-muted">{info.error}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Plano" value={info.planName ?? "—"} />
              <Stat
                label="Anúncios"
                value={info.ads ? `${info.ads.used} de ${info.ads.total}` : "—"}
                meter={info.ads}
              />
              <Stat
                label="Destaques usados"
                value={
                  info.bumps
                    ? `${info.bumps.used} de ${info.bumps.total}`
                    : "Sem destaques no plano"
                }
                meter={info.bumps}
                hint={
                  info.renewsAt ? `Renova em ${formatDateTime(new Date(info.renewsAt))}` : undefined
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return <PlanTypesCard portalKey={portalKey} canWrite={canWrite} info={info} />;
}

function PlanTypesCard({
  portalKey,
  canWrite,
  info,
}: {
  portalKey: string;
  canWrite: boolean;
  info: Extract<AdTypesInfo, { mode: "plan" }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(info.current ?? DEFAULT_VALUE);
  const [saving, setSaving] = useState(false);

  const options: SelectOption[] = [
    { value: DEFAULT_VALUE, label: "Automático (o de maior cota livre)" },
    ...info.options.map((option) => ({
      value: option.id,
      label: option.quota ? `${option.name} · ${quotaLabel(option.quota)}` : option.name,
    })),
  ];
  // o padrão salvo pode ter saído do plano: continua legível
  if (info.current && !info.options.some((option) => option.id === info.current)) {
    options.push({ value: info.current, label: `${info.current} (fora do plano agora)` });
  }

  async function handleSelect(next: string) {
    setValue(next);
    setSaving(true);
    const result = await apiPatch(`/api/admin/portals/${portalKey}/settings`, {
      listingTypeId: next === DEFAULT_VALUE ? null : next,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não consegui salvar", result.error);
      return;
    }
    toast.success("Tipo padrão salvo", "Vale para os próximos anúncios novos.");
    router.refresh();
  }

  const withQuota = info.options.filter((option) => option.quota);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipos de anúncio</CardTitle>
        <CardDescription>
          Cada carro sobe num tipo do plano da loja (ex.: padrão, destaque, super destaque), e cada
          tipo tem cota própria. O padrão vale para anúncios novos; para mudar um carro já no ar,
          escolha o tipo na linha dele.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {info.error ? <p className="text-sm text-muted">{info.error}</p> : null}

        {info.options.length ? (
          <div className="max-w-sm">
            <p className="label-instrument mb-1.5 text-muted">Tipo padrão</p>
            <SelectMenu
              value={value}
              options={options}
              disabled={!canWrite || saving}
              onSelect={handleSelect}
            />
          </div>
        ) : !info.error ? (
          <p className="text-sm text-muted">
            Não consegui listar os tipos disponíveis para esta conta agora. Tente de novo mais
            tarde.
          </p>
        ) : null}

        {withQuota.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {withQuota.map((option) => (
              <Stat
                key={option.id}
                label={option.name}
                value={`${option.quota!.used} de ${option.quota!.total}`}
                meter={option.quota}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  meter,
  hint,
}: {
  label: string;
  value: string;
  meter?: Quota | null;
  hint?: string;
}) {
  const ratio = meter && meter.total > 0 ? Math.min(1, meter.used / meter.total) : null;
  return (
    <div className="min-w-0">
      <p className="label-instrument truncate text-muted">{label}</p>
      <p className="truncate tabular-nums text-text">{value}</p>
      {ratio !== null ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={ratio >= 1 ? "h-full bg-danger" : "h-full bg-accent"}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Células por carro                                                         */
/* ------------------------------------------------------------------------ */

function ListingTypeCell({
  portalKey,
  listing,
  info,
  names,
  disabled,
}: {
  portalKey: string;
  listing: Listing;
  info: Extract<AdTypesInfo, { mode: "plan" }>;
  names: Map<string, string>;
  disabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(listing.listingType ?? DEFAULT_VALUE);
  const [saving, setSaving] = useState(false);

  const applied = listing.appliedListingType;
  const defaultLabel = applied ? `Manter (${names.get(applied) ?? applied})` : "Padrão da loja";
  const options: SelectOption[] = [
    { value: DEFAULT_VALUE, label: defaultLabel },
    ...info.options.map((option) => ({ value: option.id, label: option.name })),
  ];

  async function handleSelect(next: string) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setSaving(true);
    const result = await apiPatch(`/api/admin/portals/${portalKey}/listings/${listing.id}`, {
      listingType: next === DEFAULT_VALUE ? null : next,
    });
    setSaving(false);
    if (!result.ok) {
      setValue(previous);
      toast.error("Não consegui trocar o tipo", result.error);
      return;
    }
    toast.success("Tipo trocado", "Enviando para o portal agora.");
    router.refresh();
  }

  // pedido e ainda não confirmado pelo portal: diz que está a caminho
  const pending = listing.listingType && listing.listingType !== applied;

  return (
    <div className="space-y-1">
      <SelectMenu
        value={value}
        options={options}
        disabled={disabled || saving}
        onSelect={handleSelect}
      />
      {pending && listing.status !== "erro" ? (
        <p className="text-xs text-faint">Aplicando no portal…</p>
      ) : null}
    </div>
  );
}

function HighlightCell({
  portalKey,
  listing,
  canWrite,
}: {
  portalKey: string;
  listing: Listing;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  // a OLX só aceita outro destaque 7 dias depois do anterior
  const last = listing.highlightedAt ? new Date(listing.highlightedAt) : null;
  const active = last ? Date.now() - last.getTime() < 7 * 24 * 60 * 60 * 1000 : false;

  async function handleHighlight() {
    const confirmed = await confirm({
      title: `Destacar ${listing.vehicle}`,
      description:
        "O anúncio volta ao topo agora, e o plano agenda as próximas voltas da semana. Isso gasta um destaque do saldo da conta.",
      confirmLabel: "Destacar",
    });
    if (!confirmed) return;
    setBusy(true);
    const result = await apiPost(
      `/api/admin/portals/${portalKey}/listings/${listing.id}/highlight`,
      {},
    );
    setBusy(false);
    if (!result.ok) {
      toast.error("Não deu para destacar", result.error);
      return;
    }
    toast.success("Anúncio destacado", "Ele volta ao topo da busca em instantes.");
    router.refresh();
  }

  if (active && last) {
    return (
      <div>
        <Badge tone="info">Em destaque</Badge>
        <p className="mt-1 text-xs text-faint">desde {formatDateTime(last)}</p>
      </div>
    );
  }
  if (!listing.canHighlight) return <span className="text-faint">—</span>;
  return canWrite ? (
    <Button type="button" variant="secondary" size="sm" loading={busy} onClick={handleHighlight}>
      <ArrowUpToLine className="h-3.5 w-3.5" />
      Destacar
    </Button>
  ) : (
    <span className="text-faint">—</span>
  );
}
