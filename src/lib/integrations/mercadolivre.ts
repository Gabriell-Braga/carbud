import type { Vehicle } from "@/db/schema";
import { ApiError } from "@/lib/http";
import type { PortalApp } from "./portal-apps";
import type { OauthTokens } from "./portal-oauth";

/**
 * Mercado Livre: anúncios de veículos (classificados) e notificações.
 *
 * A API é a mesma do marketplace, com três diferenças que mandam aqui:
 * `buying_mode: "classified"`, localização obrigatória com ids PRÓPRIOS do
 * ML (não CEP nem IBGE), e atributos com valores em português que o ML
 * reconhece. Nada disso o ML infere: o que ele não reconhece, recusa com
 * uma lista de causas — e é essa lista que vira o erro mostrado na tela.
 *
 * Referência: https://developers.mercadolivre.com.br/pt_br/publicacao-de-automoveis
 */

const API = "https://api.mercadolibre.com";

/** Carros e caminhonetes no site brasileiro. */
export const ML_CARS_CATEGORY = "MLB1744";

/* ------------------------------------------------------------------------ */
/* Notificações                                                              */
/* ------------------------------------------------------------------------ */

export type MercadoLivreNotification = {
  /** Id que o ML atribui à notificação; é a chave de idempotência. */
  id: string;
  topic: string;
  /** Caminho do recurso que mudou, ex.: "/items/MLB123". */
  resource: string;
  /** Conta da loja no ML, como string — é assim que fica na conexão. */
  externalUserId: string;
  applicationId: string;
};

type RawNotification = {
  _id?: unknown;
  topic?: unknown;
  resource?: unknown;
  user_id?: unknown;
  application_id?: unknown;
  sent?: unknown;
};

/**
 * Lê o corpo do jeito que o ML manda; devolve null para o que não é dele.
 *
 * `_id` nem sempre vem: quando falta, a chave passa a ser recurso + instante
 * de envio, que é o que torna dois reenvios do mesmo aviso iguais.
 */
export function parseNotification(body: unknown): MercadoLivreNotification | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as RawNotification;

  if (typeof raw.topic !== "string" || typeof raw.resource !== "string") return null;
  if (raw.user_id === undefined || raw.application_id === undefined) return null;

  const id =
    typeof raw._id === "string" && raw._id
      ? raw._id
      : `${raw.resource}@${typeof raw.sent === "string" ? raw.sent : "sem-data"}`;

  return {
    id,
    topic: raw.topic,
    resource: raw.resource,
    externalUserId: String(raw.user_id),
    applicationId: String(raw.application_id),
  };
}

/* ------------------------------------------------------------------------ */
/* Montagem do anúncio (puro, testável)                                      */
/* ------------------------------------------------------------------------ */

/** Contato e endereço que saem no anúncio. Vêm da unidade ou do site da revenda. */
export type SellerInfo = {
  name: string;
  email: string | null;
  /** Só dígitos, com DDD, sem o 55. */
  whatsapp: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  /** UF ("SP") ou nome ("São Paulo"): os dois são aceitos na resolução. */
  state: string | null;
  zip: string | null;
};

/** Ids do ML para o endereço, resolvidos uma vez e guardados na conexão. */
export type MlLocation = {
  stateId: string;
  cityId: string;
  /** O que gerou a resolução; muda o endereço, resolve de novo. */
  key: string;
};

export type MlAttribute = { id: string; value_name: string };

const FUEL: Record<string, string> = {
  flex: "Gasolina e álcool",
  gasolina: "Gasolina",
  etanol: "Álcool",
  diesel: "Diesel",
  gnv: "Gasolina e gás natural",
  hibrido: "Híbrido",
  eletrico: "Elétrico",
};

const TRANSMISSION: Record<string, string> = {
  manual: "Manual",
  automatico: "Automática",
  automatizado: "Automática sequencial",
  cvt: "CVT",
};

const BODY: Record<string, string> = {
  hatch: "Hatchback",
  sedan: "Sedán",
  suv: "SUV",
  picape: "Pick-Up",
  minivan: "Minivan",
  cupe: "Coupé",
  conversivel: "Conversível",
  utilitario: "Furgão",
};

/** Opcionais nossos → atributos "Sim" do ML. Só os que o ML documenta. */
const OPTION_FLAGS: Record<string, string> = {
  "ar-condicionado": "HAS_AIR_CONDITIONING",
  "ar-digital": "HAS_AIR_CONDITIONING",
  "vidros-eletricos": "HAS_POWER_WINDOWS",
  "travas-eletricas": "HAS_POWER_DOOR_LOCKS",
  "banco-couro": "HAS_LEATHER_UPHOLSTERY",
  "teto-solar": "HAS_SLIDING_ROOF",
  abs: "HAS_ABS_BRAKES",
  airbag: "HAS_PASSENGER_AIRBAG",
  "sensor-re": "HAS_PARKING_SENSOR",
  alarme: "HAS_ALARM",
  "computador-bordo": "HAS_ONBOARD_COMPUTER",
  "rodas-liga": "HAS_ALLOY_WHEELS",
  multimidia: "HAS_STEERING_WHEEL_CONTROL",
};

/** Título do ML tem 60 caracteres; marca, modelo, versão e ano, nessa ordem de importância. */
export function itemTitle(vehicle: Pick<Vehicle, "brand" | "model" | "version" | "yearModel">) {
  const full = [vehicle.brand, vehicle.model, vehicle.version, String(vehicle.yearModel)]
    .filter(Boolean)
    .join(" ");
  if (full.length <= 60) return full;
  const short = `${vehicle.brand} ${vehicle.model} ${vehicle.yearModel}`;
  return short.length <= 60 ? short : short.slice(0, 60).trim();
}

export function itemAttributes(vehicle: Vehicle): MlAttribute[] {
  const attributes: MlAttribute[] = [
    { id: "BRAND", value_name: vehicle.brand },
    { id: "MODEL", value_name: vehicle.model },
    { id: "VEHICLE_YEAR", value_name: String(vehicle.yearModel) },
    { id: "KILOMETERS", value_name: `${vehicle.mileageKm} km` },
    { id: "ITEM_CONDITION", value_name: "Usado" },
  ];
  if (vehicle.version) attributes.push({ id: "TRIM", value_name: vehicle.version });
  if (vehicle.doors) attributes.push({ id: "DOORS", value_name: String(vehicle.doors) });
  if (vehicle.color) attributes.push({ id: "COLOR", value_name: vehicle.color });
  if (vehicle.fuel && FUEL[vehicle.fuel]) {
    attributes.push({ id: "FUEL_TYPE", value_name: FUEL[vehicle.fuel] });
  }
  if (vehicle.transmission && TRANSMISSION[vehicle.transmission]) {
    attributes.push({ id: "TRANSMISSION", value_name: TRANSMISSION[vehicle.transmission] });
  }
  if (vehicle.bodyType && BODY[vehicle.bodyType]) {
    attributes.push({ id: "VEHICLE_BODY_TYPE", value_name: BODY[vehicle.bodyType] });
  }

  const options = new Set(vehicle.options ?? []);
  if (options.has("direcao-eletrica")) attributes.push({ id: "STEERING", value_name: "Elétrica" });
  else if (options.has("direcao-hidraulica")) {
    attributes.push({ id: "STEERING", value_name: "Hidráulica" });
  }
  if (options.has("4x4")) attributes.push({ id: "TRACTION_CONTROL", value_name: "4x4" });

  const flagged = new Set<string>();
  for (const option of options) {
    const flag = OPTION_FLAGS[option];
    if (flag && !flagged.has(flag)) {
      flagged.add(flag);
      attributes.push({ id: flag, value_name: "Sim" });
    }
  }
  return attributes;
}

/** WhatsApp em país + número, como o ML pede (obrigatório para concessionária). */
export function sellerContact(seller: SellerInfo) {
  const digits = seller.whatsapp?.replace(/\D/g, "") ?? "";
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return {
    contact: seller.name,
    ...(seller.email ? { email: seller.email } : {}),
    ...(national
      ? {
          country_code: "55",
          area_code: national.slice(0, 2),
          phone: national.slice(2),
          country_code2: "55",
          phone2: national,
        }
      : {}),
  };
}

export type ItemInput = {
  vehicle: Vehicle;
  /** URLs públicas das fotos, na ordem (capa primeiro). */
  pictureUrls: string[];
  seller: SellerInfo;
  location: MlLocation;
  listingTypeId: string;
};

/** O corpo de POST /items. Para PUT, `updatePayload` recorta o que pode mudar. */
export function itemPayload(input: ItemInput) {
  const { vehicle, seller, location } = input;
  return {
    title: itemTitle(vehicle),
    category_id: ML_CARS_CATEGORY,
    price: Math.round(vehicle.priceCents / 100),
    currency_id: "BRL",
    available_quantity: 1,
    buying_mode: "classified",
    listing_type_id: input.listingTypeId,
    condition: "used",
    pictures: input.pictureUrls.map((source) => ({ source })),
    description: { plain_text: vehicle.description?.trim() || itemTitle(vehicle) },
    seller_contact: sellerContact(seller),
    location: {
      // o ML quer "rua, número" e nada depois do número
      address_line: [seller.street, seller.number].filter(Boolean).join(", "),
      zip_code: seller.zip?.replace(/\D/g, "") ?? "",
      city: { id: location.cityId },
      state: { id: location.stateId },
      country: { id: "BR" },
    },
    attributes: itemAttributes(vehicle),
  };
}

/** Anúncio no ar aceita mudar preço, fotos e atributos; título e categoria não. */
export function updatePayload(input: ItemInput) {
  const full = itemPayload(input);
  return {
    price: full.price,
    pictures: full.pictures,
    attributes: full.attributes,
  };
}

/* ------------------------------------------------------------------------ */
/* Cliente HTTP                                                              */
/* ------------------------------------------------------------------------ */

type MlError = {
  message?: string;
  error?: string;
  cause?: unknown;
};

/**
 * Códigos que o ML devolve sem explicação e que a revenda precisa entender.
 * O código original segue entre parênteses para quem for procurar suporte.
 */
const KNOWN_ERRORS: Record<string, string> = {
  "seller.unable_to_list":
    "A conta no Mercado Livre não está liberada para anunciar. Entre no ML com a conta conectada, vá em Minha conta > Meu perfil e complete o que estiver pendente: telefone, endereço e dados da empresa.",
  "user.not_allowed":
    "A conta no Mercado Livre não tem permissão para esta operação. Confira o cadastro em Minha conta > Meu perfil.",
};

/**
 * Transforma a resposta de erro do ML em uma frase que a revenda entende.
 *
 * O ML devolve `cause` de formas diferentes: lista de objetos com
 * `message` ("Attribute DOORS is required"), lista de strings
 * ("phone_pending"), ou nada. Tudo que vier é repassado — sem isso, "erro
 * 400" não diz o que corrigir, nem na ficha nem na conta.
 */
export function describeError(status: number, body: MlError): string {
  const causes: string[] = [];
  if (Array.isArray(body.cause)) {
    for (const cause of body.cause) {
      if (typeof cause === "string") causes.push(cause);
      else if (cause && typeof cause === "object") {
        const item = cause as { code?: string; message?: string };
        causes.push(item.message ?? item.code ?? "");
      }
    }
  } else if (typeof body.cause === "string") {
    causes.push(body.cause);
  }
  const details = causes.filter(Boolean).join("; ");

  // cota do tipo de anúncio: a frase do ML não diz o que fazer
  if (/listing type is temporarily unavailable/i.test(details)) {
    return "A conta atingiu o limite de anúncios deste tipo no Mercado Livre. Escolha outro tipo de anúncio nesta tela ou contrate um pacote de anúncios de veículos no ML.";
  }

  const code = body.message ?? body.error ?? "";
  const known = KNOWN_ERRORS[code];
  if (known) return details ? `${known} (${code}: ${details})` : `${known} (${code})`;

  const head = code || `HTTP ${status}`;
  return details ? `${head}: ${details}` : head;
}

export type MlItem = {
  id: string;
  permalink?: string;
  /** active, paused, closed, under_review, payment_required, inactive... */
  status?: string;
  sub_status?: string[];
};

/**
 * O que a situação do anúncio no ML significa para quem olha o card.
 * "active" não gera nota: é o esperado. As outras dizem por que o carro
 * não aparece no site ainda, que é a pergunta que a revenda faz.
 */
export function itemStatusNote(item: MlItem): string | null {
  const sub = item.sub_status?.length ? ` (${item.sub_status.join(", ")})` : "";
  switch (item.status) {
    case undefined:
    case "active":
      return null;
    case "payment_required":
      return "Criado, mas o tipo de anúncio é pago: o Mercado Livre só publica depois do pagamento, em Central de vendedores > Anúncios.";
    case "under_review":
      return `Em revisão pelo Mercado Livre${sub}. Costuma liberar em algumas horas.`;
    case "paused":
      if (item.sub_status?.includes("picture_download_pending")) {
        return "O Mercado Livre ainda está baixando as fotos; publica sozinho quando terminar.";
      }
      return `Pausado no Mercado Livre${sub}.`;
    case "closed":
      return "Encerrado no Mercado Livre.";
    default:
      return `Situação no Mercado Livre: ${item.status}${sub}.`;
  }
}

/* ------------------------------------------------------------------------ */
/* Perguntas (a via de volta: quem pergunta no anúncio vira lead)            */
/* ------------------------------------------------------------------------ */

export type MlQuestion = {
  id: string;
  /** Anúncio a que a pergunta se refere, ex.: "MLB123456789". */
  itemId: string;
  text: string;
  /** Conta de quem perguntou. É o que o ML dá — não há telefone nem e-mail. */
  fromUserId: string;
  createdAt: string | null;
  answered: boolean;
};

type RawQuestion = {
  id?: unknown;
  item_id?: unknown;
  text?: unknown;
  status?: unknown;
  date_created?: unknown;
  from?: { id?: unknown } | null;
  answer?: { text?: unknown } | null;
};

/**
 * Lê `/questions/{id}` do jeito que o ML responde.
 *
 * Pergunta sem `item_id` ou sem autor não vira lead: sem o anúncio não dá
 * para dizer de que carro se trata, e sem o autor não há como reconhecer a
 * mesma pessoa na pergunta seguinte.
 */
export function parseQuestion(body: unknown): MlQuestion | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as RawQuestion;

  const id = raw.id === undefined || raw.id === null ? null : String(raw.id);
  const itemId = typeof raw.item_id === "string" ? raw.item_id : null;
  const fromId =
    raw.from && raw.from.id !== undefined && raw.from.id !== null ? String(raw.from.id) : null;
  if (!id || !itemId || !fromId) return null;

  return {
    id,
    itemId,
    text: typeof raw.text === "string" ? raw.text.trim() : "",
    fromUserId: fromId,
    createdAt: typeof raw.date_created === "string" ? raw.date_created : null,
    answered: raw.status === "ANSWERED" || Boolean(raw.answer && raw.answer.text),
  };
}

type RawUser = { nickname?: unknown; first_name?: unknown; last_name?: unknown };

/**
 * O nome de quem perguntou, com o que o ML deixa ver.
 *
 * Em pergunta o ML expõe só o apelido da conta — nome e sobrenome vêm
 * vazios até existir uma venda. Apelido é melhor que "Comprador": é por ele
 * que a revenda acha a conversa lá dentro.
 */
export function buyerName(body: unknown, fallbackUserId: string): string {
  const raw = (body ?? {}) as RawUser;
  const first = typeof raw.first_name === "string" ? raw.first_name.trim() : "";
  const last = typeof raw.last_name === "string" ? raw.last_name.trim() : "";
  const full = [first, last].filter(Boolean).join(" ");
  if (full) return full;

  const nickname = typeof raw.nickname === "string" ? raw.nickname.trim() : "";
  return nickname || `Comprador ${fallbackUserId} (Mercado Livre)`;
}

export class MercadoLivreClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetcher(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const payload = (await response.json().catch(() => ({}))) as T & MlError;
    if (!response.ok) {
      throw new ApiError(
        response.status === 401 ? 401 : 502,
        describeError(response.status, payload),
      );
    }
    return payload;
  }

  /** Estados do Brasil e, para um estado, as cidades — com os ids do ML. */
  states(): Promise<{ states: { id: string; name: string }[] }> {
    return this.call("GET", "/classified_locations/countries/BR");
  }

  cities(stateId: string): Promise<{ cities: { id: string; name: string }[] }> {
    return this.call("GET", `/classified_locations/states/${stateId}`);
  }

  /** Tipos de anúncio que ESTA conta pode usar na categoria (depende do plano dela). */
  availableListingTypes(userId: string, categoryId = ML_CARS_CATEGORY) {
    return this.call<{ available: { id: string; name: string }[] }>(
      "GET",
      `/users/${userId}/available_listing_types?category_id=${categoryId}`,
    );
  }

  createItem(payload: ReturnType<typeof itemPayload>) {
    return this.call<MlItem>("POST", "/items", payload);
  }

  getItem(itemId: string) {
    return this.call<MlItem>("GET", `/items/${itemId}?attributes=id,permalink,status,sub_status`);
  }

  updateItem(itemId: string, payload: ReturnType<typeof updatePayload>) {
    return this.call<{ id: string; permalink: string }>("PUT", `/items/${itemId}`, payload);
  }

  setDescription(itemId: string, plainText: string) {
    return this.call("PUT", `/items/${itemId}/description`, { plain_text: plainText });
  }

  /**
   * O recurso que a notificação apontou, pelo caminho que ela mandou.
   *
   * O ML recomenda chamar o `resource` como veio, em vez de remontar a URL:
   * é o que mantém o handler funcionando quando eles mudam o formato de um
   * tópico. O caminho é validado antes de chegar aqui.
   */
  getResource<T>(resource: string) {
    return this.call<T>("GET", resource);
  }

  /** Dados públicos de uma conta — em pergunta, só o apelido vem preenchido. */
  getUser(userId: string) {
    return this.call<unknown>("GET", `/users/${userId}`);
  }

  /** Troca o tipo de um anúncio no ar (ex.: de gratuito para um pago). */
  changeListingType(itemId: string, listingTypeId: string) {
    return this.call("POST", `/items/${itemId}/listing_type`, { id: listingTypeId });
  }

  /** Encerrado não volta: é o que se quer para carro vendido. */
  closeItem(itemId: string) {
    return this.call<{ id: string; status: string }>("PUT", `/items/${itemId}`, {
      status: "closed",
    });
  }
}

/**
 * Renova o token. O de acesso vence em 6 horas e o refresh token é de uso
 * único: cada renovação devolve um par novo, e o antigo morre. Quem chama
 * precisa guardar o que volta na hora — perder o refresh novo é perder a
 * conexão.
 */
export async function refreshTokens(
  app: PortalApp,
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<OauthTokens> {
  const response = await fetcher(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: number | string;
  } & MlError;

  if (!response.ok || !payload.access_token) {
    throw new ApiError(
      401,
      `Mercado Livre não renovou o acesso: ${describeError(response.status, payload)}`,
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (payload.expires_in ?? 21600) * 1000).toISOString(),
    ...(payload.user_id !== undefined ? { externalUserId: String(payload.user_id) } : {}),
  };
}

/** Normaliza para casar nome de cidade/estado com o que o ML devolve. */
export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const UF_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** "SP" e "São Paulo" viram o mesmo nome; o ML lista estados pelo nome. */
export function stateName(value: string): string {
  const upper = value.trim().toUpperCase();
  return UF_NAMES[upper] ?? value.trim();
}
