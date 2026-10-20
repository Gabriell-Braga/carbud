/**
 * Vocabulario dos veiculos: os valores que o banco guarda e o texto que o
 * visitante le.
 *
 * Mora aqui, e nao no schema, porque quem precisa dos rotulos e o template — e
 * o app dos sites nao tem banco nenhum. O schema do painel importa os valores
 * DESTE arquivo, e nao o contrario: assim a lista de combustiveis tem um dono
 * so, e o Worker do painel nao carrega componente React junto.
 */

export const VEHICLE_STATUS = ["draft", "available", "reserved", "sold"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUS)[number];

export const TRANSMISSIONS = ["manual", "automatico", "automatizado", "cvt"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const FUELS = ["flex", "gasolina", "etanol", "diesel", "gnv", "hibrido", "eletrico"] as const;
export type Fuel = (typeof FUELS)[number];

export const BODY_TYPES = [
  "hatch",
  "sedan",
  "suv",
  "picape",
  "minivan",
  "cupe",
  "conversivel",
  "utilitario",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manual: "Manual",
  automatico: "Automático",
  automatizado: "Automatizado",
  cvt: "CVT",
};

export const FUEL_LABELS: Record<Fuel, string> = {
  flex: "Flex",
  gasolina: "Gasolina",
  etanol: "Etanol",
  diesel: "Diesel",
  gnv: "GNV",
  hibrido: "Híbrido",
  eletrico: "Elétrico",
};

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  hatch: "Hatch",
  sedan: "Sedã",
  suv: "SUV",
  picape: "Picape",
  minivan: "Minivan",
  cupe: "Cupê",
  conversivel: "Conversível",
  utilitario: "Utilitário",
};

/**
 * Campos opcionais do formulário antes do WhatsApp. O telefone não entra na
 * lista porque é sempre pedido: sem ele o lead não tem como ser atendido.
 */
export const WHATSAPP_FORM_FIELDS = ["name", "email", "message", "tradeIn"] as const;
export type WhatsappFormField = (typeof WHATSAPP_FORM_FIELDS)[number];

export const WHATSAPP_FORM_FIELD_LABELS: Record<WhatsappFormField, string> = {
  name: "Nome",
  email: "E-mail",
  message: "O que procura",
  tradeIn: "Carro para a troca",
};

/** O que o formulário pedia antes de dar para escolher: nome e telefone. */
export const DEFAULT_WHATSAPP_FORM_FIELDS: WhatsappFormField[] = ["name"];
