import type {
  AppraisalStatus,
  BillingStatus,
  FinancingStatus,
  LeadSource,
  LeadStatus,
  LostReason,
  PaymentMethod,
  StageKind,
  TaskKind,
  VehicleStatus,
} from "@/db/schema";

/*
 * Cambio, combustivel e carroceria vem do pacote compartilhado: sao os unicos
 * rotulos que o site publico tambem desenha, e o app dos sites nao enxerga
 * este arquivo. O resto (lead, cobranca, avaliacao) e vocabulario de painel e
 * continua aqui.
 */
export {
  TRANSMISSION_LABELS,
  FUEL_LABELS,
  BODY_TYPE_LABELS,
} from "@carbud/site-kit/catalog";

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  draft: "Rascunho",
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Novo",
  in_progress: "Em atendimento",
  won: "Convertido",
  lost: "Perdido",
};

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  adimplente: "Adimplente",
  inadimplente: "Inadimplente",
  suspenso: "Suspensa",
};

export const COLORS = [
  "Branco", "Prata", "Preto", "Cinza", "Vermelho", "Azul", "Verde",
  "Marrom", "Bege", "Amarelo", "Laranja", "Dourado", "Vinho",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  form: "Formulário do site",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  manual: "Cadastro manual",
  portal: "Portal de classificados",
  meta_ads: "Anúncio Facebook/Instagram",
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  preco: "Preço",
  avaliacao_troca: "Avaliação da troca",
  credito_negado: "Crédito negado",
  comprou_outro_lugar: "Comprou em outro lugar",
  desistiu: "Desistiu da compra",
  sem_contato: "Não respondeu",
  sem_estoque: "Não tínhamos o carro",
  curioso: "Só pesquisando",
  outro: "Outro motivo",
};

/**
 * Perdas que ainda dá para reverter mexendo no valor. Essas avisam a gerência:
 * "perdi por R$ 2 mil" só tem conserto se alguém com alçada souber a tempo.
 */
export const ESCALATED_LOST_REASONS: readonly LostReason[] = ["preco", "avaliacao_troca"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  a_vista: "À vista",
  financiado: "Financiado",
  consorcio: "Consórcio",
  troca_mais_volta: "Troca com volta",
};

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  call: "Ligar",
  whatsapp: "WhatsApp",
  visit: "Visita na loja",
  test_drive: "Test drive",
  other: "Outro",
};

export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  open: "Em andamento",
  won: "Fecha como ganho",
  lost: "Fecha como perdido",
};

export const FINANCING_STATUS_LABELS: Record<FinancingStatus, string> = {
  rascunho: "Rascunho",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
  contratado: "Contratado",
  cancelado: "Cancelado",
};

export const APPRAISAL_STATUS_LABELS: Record<AppraisalStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Oferta enviada",
  aceita: "Aceita",
  recusada: "Recusada",
  expirada: "Expirada",
};

export const DISTRIBUTION_MODE_LABELS: Record<string, string> = {
  off: "Desligada",
  round_robin: "Rodízio entre a equipe",
  by_store: "Rodízio dentro da unidade",
};
