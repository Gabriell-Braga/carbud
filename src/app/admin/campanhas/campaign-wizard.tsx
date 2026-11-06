"use client";

import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { LEAD_STATUS, type LeadStatus } from "@/db/schema";
import { LEAD_STATUS_LABELS } from "@/lib/catalog/labels";
import { apiGet, apiPost } from "@/lib/client/api";
import { cn, formatNumber } from "@/lib/utils";
import { runCampaign, type SendProgress } from "./campaigns-panel";

type Template = {
  name: string;
  language: string;
  category: string;
  body: string;
  placeholders: number;
  headerFormat: string | null;
};

const STEPS = ["Finalidade", "Seleção", "Mensagem", "Resumo", "Enviar"] as const;

/** Finalidades comuns; o texto continua editável. */
const PURPOSES = [
  "Oferecer veículo a quem já demonstrou interesse em modelo parecido.",
  "Retomar contato com quem não fechou negócio.",
  "Relacionamento e pós-venda com quem já comprou na loja.",
];

const TOKENS = ["{nome}", "{veiculo}", "{revenda}"];

export function CampaignWizard({
  teams,
  vehicles,
  onClose,
}: {
  teams: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  onClose: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState(PURPOSES[0]);

  const [interest, setInterest] = useState("");
  const [statuses, setStatuses] = useState<LeadStatus[]>(["lost", "in_progress"]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [teamId, setTeamId] = useState("");
  const [preview, setPreview] = useState<{ total: number; sample: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [vehicleId, setVehicleId] = useState("");

  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [finished, setFinished] = useState(false);

  const template = templates?.find((item) => `${item.name}|${item.language}` === templateKey);
  const audience = {
    interest: interest.trim() || undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    teamId: teamId || undefined,
  };

  useEffect(() => {
    if (step !== 2 || templates) return;
    void apiGet<{ templates: Template[] }>("/api/admin/campaigns/templates").then((result) => {
      if (result.ok) setTemplates(result.data.templates);
      else setTemplateError(result.error);
    });
  }, [step, templates]);

  async function loadPreview() {
    setPreviewing(true);
    const result = await apiPost<{ total: number; sample: string[] }>(
      "/api/admin/campaigns/preview",
      audience,
    );
    setPreviewing(false);
    if (!result.ok) {
      toast.error("Não consegui contar a lista", result.error);
      return false;
    }
    setPreview(result.data);
    return true;
  }

  function chooseTemplate(key: string) {
    setTemplateKey(key);
    const chosen = templates?.find((item) => `${item.name}|${item.language}` === key);
    // sugestão: primeira variável é o nome, segunda o carro — o caso mais comum
    setParameters(
      Array.from({ length: chosen?.placeholders ?? 0 }, (_, index) => TOKENS[index] ?? ""),
    );
  }

  function canAdvance(): string | null {
    if (step === 0) {
      if (name.trim().length < 2) return "Dê um nome à campanha";
      if (purpose.trim().length < 5) return "Diga a finalidade";
    }
    if (step === 1 && (!preview || preview.total === 0)) return "A lista está vazia";
    if (step === 2) {
      if (!template) return "Escolha o modelo";
      if (parameters.some((value) => !value.trim())) return "Preencha todas as variáveis";
      if (template.headerFormat === "IMAGE" && !vehicleId) return "Escolha o carro da foto";
    }
    return null;
  }

  async function next() {
    const problem = canAdvance();
    if (problem) {
      toast.error(problem);
      return;
    }
    if (step === 1 && !(await loadPreview())) return;
    setStep((current) => current + 1);
  }

  async function execute() {
    if (!template) return;
    setCreating(true);
    const created = await apiPost<{ id: string }>("/api/admin/campaigns", {
      name: name.trim(),
      purpose: purpose.trim(),
      audience,
      templateName: template.name,
      templateLanguage: template.language,
      parameters,
      vehicleId: vehicleId || null,
    });
    if (!created.ok) {
      setCreating(false);
      toast.error("Não consegui criar a campanha", created.error);
      return;
    }
    setStep(4);
    const error = await runCampaign(created.data.id, setProgress);
    setCreating(false);
    setFinished(true);
    if (error) toast.error("O envio parou", `${error} Use "Continuar" na lista para retomar.`);
    else toast.success("Campanha enviada");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova campanha</CardTitle>
        <CardDescription>
          <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={cn(
                  "text-xs",
                  index === step ? "font-medium text-accent-text" : index < step ? "text-muted" : "text-faint",
                )}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 0 ? (
          <>
            <FormField label="Nome da campanha" htmlFor={`${id}-name`}>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Kwid chegou — novembro"
              />
            </FormField>
            <FormField
              label="Finalidade"
              htmlFor={`${id}-purpose`}
              hint="A LGPD pede que o uso dos dados tenha finalidade declarada. Fica registrada junto com a campanha."
            >
              <Select
                id={`${id}-purpose-preset`}
                aria-label="Finalidade sugerida"
                className="mb-2"
                value={PURPOSES.includes(purpose) ? purpose : ""}
                onChange={(event) => setPurpose(event.target.value)}
              >
                {PURPOSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="">Outra (escreva abaixo)</option>
              </Select>
              <Textarea
                id={`${id}-purpose`}
                rows={2}
                maxLength={300}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              />
            </FormField>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <FormField
              label="Interesse em"
              htmlFor={`${id}-interest`}
              hint="Procura na ficha de negociação e no carro do anúncio. Vazio = qualquer carro."
            >
              <Input
                id={`${id}-interest`}
                value={interest}
                maxLength={80}
                onChange={(event) => {
                  setInterest(event.target.value);
                  setPreview(null);
                }}
                placeholder="Kwid"
              />
            </FormField>
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-[13px] font-medium text-text">Situação do lead</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                {LEAD_STATUS.map((status) => (
                  <label key={status} className="inline-flex items-center gap-2">
                    <Checkbox
                      checked={statuses.includes(status)}
                      onChange={(event) => {
                        setPreview(null);
                        setStatuses((current) =>
                          event.target.checked
                            ? [...current, status]
                            : current.filter((item) => item !== status),
                        );
                      }}
                    />
                    {LEAD_STATUS_LABELS[status]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
              <FormField label="Chegou a partir de" htmlFor={`${id}-from`}>
                <Input
                  id={`${id}-from`}
                  type="date"
                  value={createdFrom}
                  onChange={(event) => {
                    setCreatedFrom(event.target.value);
                    setPreview(null);
                  }}
                />
              </FormField>
              <FormField label="Até" htmlFor={`${id}-to`}>
                <Input
                  id={`${id}-to`}
                  type="date"
                  value={createdTo}
                  onChange={(event) => {
                    setCreatedTo(event.target.value);
                    setPreview(null);
                  }}
                />
              </FormField>
              {teams.length > 0 ? (
                <FormField label="Equipe" htmlFor={`${id}-team`}>
                  <Select
                    id={`${id}-team`}
                    value={teamId}
                    onChange={(event) => {
                      setTeamId(event.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="">Todas</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" loading={previewing} onClick={loadPreview}>
                Contar pessoas
              </Button>
              {preview ? (
                <p className="text-[13px] text-muted">
                  <strong className="text-text">{formatNumber(preview.total)}</strong> pessoa(s)
                  {preview.sample.length > 0 ? `, como ${preview.sample.join(", ")}` : ""}. Quem pediu
                  para não receber já está fora.
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          templateError ? (
            <Alert tone="danger">{templateError}</Alert>
          ) : !templates ? (
            <p className="text-[13px] text-muted">Buscando os modelos aprovados na Meta…</p>
          ) : templates.length === 0 ? (
            <Alert tone="warning">
              Nenhum modelo aprovado na conta do WhatsApp. Crie um no Gerenciador do WhatsApp da Meta
              (categoria Marketing, com o botão &quot;Parar promoções&quot;) e espere a aprovação.
            </Alert>
          ) : (
            <>
              <FormField label="Modelo aprovado" htmlFor={`${id}-template`}>
                <Select
                  id={`${id}-template`}
                  value={templateKey}
                  onChange={(event) => chooseTemplate(event.target.value)}
                >
                  <option value="">Escolha</option>
                  {templates.map((item) => (
                    <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>
                      {item.name} ({item.language})
                    </option>
                  ))}
                </Select>
              </FormField>
              {template ? (
                <>
                  <p className="mb-4 whitespace-pre-wrap rounded border border-border bg-surface-2 p-3 text-[13px] text-text">
                    {template.body}
                  </p>
                  {template.headerFormat === "IMAGE" ? (
                    <FormField
                      label="Carro da foto"
                      htmlFor={`${id}-vehicle`}
                      hint="A capa do anúncio vai no topo da mensagem."
                    >
                      <Select
                        id={`${id}-vehicle`}
                        value={vehicleId}
                        onChange={(event) => setVehicleId(event.target.value)}
                      >
                        <option value="">Escolha</option>
                        {vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  ) : null}
                  {parameters.map((value, index) => (
                    <FormField
                      key={index}
                      label={`Variável {{${index + 1}}}`}
                      htmlFor={`${id}-param-${index}`}
                      hint={index === 0 ? "Use {nome}, {veiculo} ou {revenda} para preencher por pessoa." : undefined}
                    >
                      <Input
                        id={`${id}-param-${index}`}
                        value={value}
                        maxLength={200}
                        onChange={(event) =>
                          setParameters((current) =>
                            current.map((item, position) => (position === index ? event.target.value : item)),
                          )
                        }
                      />
                    </FormField>
                  ))}
                </>
              ) : null}
            </>
          )
        ) : null}

        {step === 3 && template && preview ? (
          <dl className="grid grid-cols-1 gap-y-2 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="text-muted">Campanha</dt>
            <dd className="text-text">{name}</dd>
            <dt className="text-muted">Finalidade</dt>
            <dd className="text-text">{purpose}</dd>
            <dt className="text-muted">Pessoas</dt>
            <dd className="font-medium text-text">{formatNumber(preview.total)}</dd>
            <dt className="text-muted">Modelo</dt>
            <dd className="text-text">
              {template.name} · variáveis: {parameters.join(", ") || "nenhuma"}
            </dd>
            <dt className="text-muted">Respostas</dt>
            <dd className="text-text">
              Caem no lead de cada pessoa, para o vendedor responsável. Quem responder
              &quot;sair&quot; sai das próximas campanhas.
            </dd>
          </dl>
        ) : null}

        {step === 4 ? (
          <div className="text-[13px]">
            {progress ? (
              <>
                <div className="mb-2 h-2 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${Math.round(
                        ((progress.sent + progress.failed + progress.skipped) /
                          Math.max(1, progress.sent + progress.failed + progress.skipped + progress.pending)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-muted">
                  {formatNumber(progress.sent)} enviada(s) · {formatNumber(progress.failed)} falha(s) ·{" "}
                  {formatNumber(progress.skipped)} pulada(s) · {formatNumber(progress.pending)} na fila
                </p>
              </>
            ) : (
              <p className="text-muted">Montando a lista…</p>
            )}
            {!finished ? (
              <p className="mt-2 text-xs text-faint">Deixe esta tela aberta até terminar.</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-border pt-4">
          {step < 4 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => (step === 0 ? onClose() : setStep((current) => current - 1))}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {step === 0 ? "Cancelar" : "Voltar"}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button type="button" loading={previewing} onClick={next}>
              Avançar
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : step === 3 ? (
            <Button type="button" loading={creating} onClick={execute}>
              <Send className="h-3.5 w-3.5" />
              Enviar para {formatNumber(preview?.total ?? 0)} pessoa(s)
            </Button>
          ) : (
            <Button type="button" disabled={!finished} onClick={onClose}>
              Concluir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
