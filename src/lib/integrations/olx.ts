import type { Vehicle } from "@/db/schema";
import { ApiError } from "@/lib/http";
import type { CatalogEntry } from "./catalog-match";

/**
 * OLX: anúncios de carros pela API de autoupload, destaques e leads.
 *
 * Como a OLX funciona, e o que manda no desenho daqui:
 *
 * - Um PUT com a lista de anúncios. Cada anúncio leva um `id` NOSSO (até 19
 *   caracteres) — é ele que edita e remove depois. `operation: "insert"`
 *   cria ou edita; `"delete"` despublica.
 * - A resposta síncrona só diz se o lote passou na validação. Publicar mesmo
 *   é assíncrono (moderação): o status sai depois, pelo token do lote, e é lá
 *   que aparecem o `list_id` (o id da OLX) e a URL do anúncio.
 * - Se UM anúncio do lote falha na validação síncrona, a OLX cancela o lote
 *   INTEIRO (statusCode -4) e diz qual falhou. Por isso o lote é refeito sem
 *   os recusados.
 * - Marca, modelo e versão são ids do catálogo da OLX (`car_info`). Desde
 *   set/2025 são obrigatórios e conferidos entre si; a placa também
 *   (`vehicle_tag`), em maiúsculas, para usados.
 * - Parâmetro opcional sem valor NÃO vai no payload: vazio ou zero derruba o
 *   lote.
 * - "Destaque" na OLX é o bump: o anúncio volta ao topo e o plano agenda as
 *   próximas voltas (em 7 dias). Consome saldo do plano. Fica separado da
 *   publicação e só acontece quando a loja pede.
 *
 * Referência: https://developers.olx.com.br/anuncio/api/import.html
 */

const APPS = "https://apps.olx.com.br";

/** Carros, vans e utilitários. */
export const OLX_CARS_CATEGORY = 2020;

/** A OLX recusa chamada sem User-Agent (os exemplos dela mandam um sempre). */
const USER_AGENT = "Mozilla/5.0 (compatible; Carbud/1.0)";

/* ------------------------------------------------------------------------ */
/* Id do anúncio                                                             */
/* ------------------------------------------------------------------------ */

/**
 * O id que mandamos para a OLX. O nosso é um uuid de 36 caracteres e a OLX
 * aceita 19, só letras, números, `_`, `-`, `{` e `}`. Os primeiros 19 hex do
 * uuid são únicos na prática e — o que importa — sempre os mesmos para o
 * mesmo carro, então reenviar edita em vez de duplicar.
 */
export function olxAdId(vehicleId: string): string {
  return vehicleId.replace(/[^a-z0-9]/gi, "").slice(0, 19);
}

/* ------------------------------------------------------------------------ */
/* Parâmetros do anúncio (puro, testável)                                    */
/* ------------------------------------------------------------------------ */

const GEARBOX: Record<string, string> = {
  manual: "1",
  automatico: "2",
  automatizado: "4",
  // a OLX não tem CVT; CVT é automático para quem procura
  cvt: "2",
};

/** "4 - Gás Natural" foi descontinuado: GNV vai como gasolina com kit GNV. */
const FUEL: Record<string, string> = {
  gasolina: "1",
  etanol: "2",
  flex: "3",
  gnv: "1",
  diesel: "5",
  hibrido: "6",
  eletrico: "7",
};

/** 1 (Passeio) e 4 (Antigo) foram descontinuados pela OLX. */
const CAR_TYPE: Record<string, string> = {
  conversivel: "2",
  picape: "3",
  suv: "5",
  minivan: "7",
  utilitario: "7",
  sedan: "8",
  hatch: "9",
  cupe: "11",
};

/** 2 (Direção hidráulica) saiu de car_features: vai em car_steering. */
const CAR_FEATURES: Record<string, string> = {
  "ar-condicionado": "1",
  "ar-digital": "1",
  "vidros-eletricos": "3",
  "travas-eletricas": "4",
  airbag: "5",
  alarme: "6",
  multimidia: "7",
  "sensor-re": "8",
  "camera-re": "9",
  blindado: "10",
  "banco-couro": "11",
  "computador-bordo": "12",
  gps: "16",
  "piloto-automatico": "17",
  "rodas-liga": "18",
  "teto-solar": "19",
  "4x4": "20",
};

const COLORS: [RegExp, string][] = [
  [/^preto|^preta/, "1"],
  [/^branc/, "2"],
  [/^prat/, "3"],
  [/^vermelh|^vinho|^bordo/, "4"],
  [/^cinza|^grafite|^chumbo/, "5"],
  [/^azul/, "6"],
  [/^amarel|^dourad/, "7"],
  [/^verde/, "8"],
  [/^laranj/, "9"],
];

export function olxColor(color: string | null): string | null {
  if (!color?.trim()) return null;
  const value = color.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return COLORS.find(([pattern]) => pattern.test(value))?.[1] ?? "10";
}

/** Portas: 1 = 2 portas, 2 = 4 portas, 3 = 3 portas. Cinco portas é "4" lá. */
export function olxDoors(doors: number | null): string | null {
  if (doors === 2) return "1";
  if (doors === 3) return "3";
  if (doors === 4 || doors === 5) return "2";
  return null;
}

/** Cilindrada lida da versão ("1.0 MPI", "2.0 TSI") → faixa da OLX. */
export function olxMotorPower(version: string | null): string | null {
  const match = version?.match(/\b(\d)[.,](\d)\b/);
  if (!match) return null;
  const liters = Number(`${match[1]}.${match[2]}`);
  if (liters >= 4) return "12";
  if (liters >= 3) return "11";
  if (liters >= 2) return "10";
  const table: Record<string, string> = {
    "1": "1",
    "1.2": "2",
    "1.3": "3",
    "1.4": "4",
    "1.5": "5",
    "1.6": "6",
    "1.7": "7",
    "1.8": "8",
    "1.9": "9",
  };
  return table[String(liters)] ?? null;
}

/** Antes de 1980 a OLX agrupa em faixas de cinco anos. */
export function olxRegdate(year: number): string {
  if (year >= 1980) return String(year);
  if (year >= 1975) return "1975";
  if (year >= 1970) return "1970";
  if (year >= 1965) return "1965";
  if (year >= 1960) return "1960";
  if (year >= 1955) return "1955";
  return "1950";
}

/** Telefone: DDD + número, 10 ou 11 dígitos, sem o 55. */
export function olxPhone(value: string | null): number | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length < 10 || national.length > 11) return null;
  return Number(national);
}

export type OlxCatalogIds = { brand: string; model: string; version: string };

export type OlxAdInput = {
  vehicle: Vehicle;
  /** URLs públicas, capa primeiro. A OLX aceita 20 e recusa repetidas. */
  pictureUrls: string[];
  phone: string | null;
  zip: string | null;
  catalog: OlxCatalogIds;
};

/**
 * Um anúncio do `ad_list`. Valida antes o que a OLX recusaria, com a frase
 * em português: o "ERROR_VEHICLE_TAG_INVALID" dela não diz onde mexer.
 */
export function olxAd(input: OlxAdInput) {
  const { vehicle } = input;
  const title = [vehicle.brand, vehicle.model, vehicle.version, vehicle.yearModel]
    .filter(Boolean)
    .join(" ");

  if (vehicle.priceOnRequest || vehicle.priceCents <= 0) {
    throw new ApiError(400, "A OLX exige preço; este veículo está como 'sob consulta'.");
  }
  const phone = olxPhone(input.phone);
  if (!phone) {
    throw new ApiError(
      400,
      "A OLX exige telefone com DDD. Preencha o WhatsApp ou telefone em Site ou na unidade.",
    );
  }
  const zip = input.zip?.replace(/\D/g, "") ?? "";
  if (zip.length !== 8) {
    throw new ApiError(
      400,
      "A OLX exige o CEP da loja. Preencha o endereço em Site ou na unidade.",
    );
  }
  if (input.pictureUrls.length === 0) {
    throw new ApiError(400, "A OLX exige pelo menos uma foto.");
  }
  const zeroKm = vehicle.mileageKm === 0;
  const plate = vehicle.licensePlate?.replace(/[^a-z0-9]/gi, "").toUpperCase() ?? "";
  if (!zeroKm && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) {
    throw new ApiError(
      400,
      "A OLX exige a placa completa para carro usado. Preencha a placa na ficha do veículo.",
    );
  }

  const options = new Set(vehicle.options ?? []);
  const features = [...new Set([...options].map((option) => CAR_FEATURES[option]).filter(Boolean))];

  const params: Record<string, string | number | string[]> = {
    vehicle_brand: input.catalog.brand,
    vehicle_model: input.catalog.model,
    vehicle_version: input.catalog.version,
    regdate: olxRegdate(vehicle.yearModel),
    mileage: Math.max(0, Math.round(vehicle.mileageKm)),
  };
  if (plate) params.vehicle_tag = plate;
  if (vehicle.transmission && GEARBOX[vehicle.transmission]) {
    params.gearbox = GEARBOX[vehicle.transmission];
  }
  if (vehicle.fuel && FUEL[vehicle.fuel]) params.fuel = FUEL[vehicle.fuel];
  if (vehicle.fuel === "gnv") params.gnv_kit = "1";
  if (vehicle.bodyType && CAR_TYPE[vehicle.bodyType]) params.cartype = CAR_TYPE[vehicle.bodyType];
  const color = olxColor(vehicle.color);
  if (color) params.carcolor = color;
  const doors = olxDoors(vehicle.doors);
  if (doors) params.doors = doors;
  const motor = olxMotorPower(vehicle.version);
  if (motor) params.motorpower = motor;
  if (options.has("direcao-eletrica")) params.car_steering = "2";
  else if (options.has("direcao-hidraulica")) params.car_steering = "1";
  if (features.length) params.car_features = features;
  if (zeroKm) params.zero_km = "1";

  return {
    id: olxAdId(vehicle.id),
    operation: "insert" as const,
    category: OLX_CARS_CATEGORY,
    // a OLX reescreve o título de carros sozinha, mas o campo segue obrigatório
    subject: title.slice(0, 90),
    body: (vehicle.description?.trim() || title).slice(0, 6000),
    phone,
    type: "s" as const,
    price: Math.round(vehicle.priceCents / 100),
    zipcode: zip,
    params,
    images: [...new Set(input.pictureUrls)].slice(0, 20),
  };
}

export type OlxAd = ReturnType<typeof olxAd>;

/* ------------------------------------------------------------------------ */
/* Respostas                                                                 */
/* ------------------------------------------------------------------------ */

export type ImportResponse = {
  token: string | null;
  statusCode: number;
  statusMessage: string;
  errors: { id: string; status?: string; messages?: { category?: string }[] }[];
};

/** Validação síncrona, por anúncio. */
const VALIDATION: Record<string, string> = {
  UNDEFINED_AD_ID: "anúncio sem id",
  NO_IMAGE: "sem fotos",
  NO_REGION: "CEP inválido ou fora de uma região da OLX",
  ERROR_FUEL_4_DEPRECATED: "combustível inválido",
  ERROR_FINANCIAL_INVALID: "estado financeiro inválido",
  ERROR_CAR_FEATURE_2_INVALID: "opcional inválido",
  ERROR_CAR_TYPE_1_OR_4_INVALID: "tipo de carroceria inválido",
  ERROR_VEHICLE_TAG_INVALID: "placa ausente ou em formato inválido",
  ERROR_VEHICLE_BRAND_INVALID: "marca inválida",
  ERROR_VEHICLE_MODEL_INVALID: "modelo inválido",
  ERROR_VEHICLE_VERSION_INVALID: "versão inválida",
  ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID:
    "marca, modelo e versão não batem com o catálogo da OLX",
  INVALID_PLATE: "placa não encontrada na base da OLX (ou validação fora do ar; tentamos de novo)",
  ERROR_VIDEOS_URL_INVALID: "link de vídeo inválido",
};

/** Moderação e processamento, depois do aceite do lote. */
const PROCESSING: Record<string, string> = {
  ERROR_IMAGE_TOO_SMALL: "foto pequena demais",
  ERROR_DOWNLOADING_IMAGE: "a OLX não conseguiu baixar as fotos",
  ERROR_UPLOADING_IMAGE: "a OLX não conseguiu processar as fotos",
  NOT_ENOUGH_AD_SLOTS: "o plano da conta na OLX está sem vaga para anúncio novo",
  REFUSED_SUSPECT_CATEGORY: "recusado pela moderação (categoria suspeita)",
  REFUSED_SUSPECT_REGION: "recusado pela moderação (região suspeita)",
  REFUSED_DENOUNCE: "recusado por denúncia",
  REFUSED_SUSPECT_AUTOS: "recusado pela moderação de autos",
  REFUSED_SUSPECT_DUPLICATES: "recusado como anúncio duplicado",
  REFUSED_SUSPECT_PRICE: "recusado pela moderação (preço fora do padrão)",
  REFUSED_GENERIC: "recusado pela moderação da OLX",
};

export function describeValidation(categories: string[]): string {
  const reasons = categories.map((code) => VALIDATION[code] ?? code);
  return `A OLX recusou o anúncio: ${reasons.join("; ") || "motivo não informado"}.`;
}

export function describeProcessing(messages: unknown): string {
  const codes = (Array.isArray(messages) ? messages : [])
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String(
              (item as Record<string, unknown>).error ??
                (item as Record<string, unknown>).category ??
                "",
            )
          : "",
    )
    .filter(Boolean);
  const reasons = codes.map((code) => PROCESSING[code] ?? code);
  return `A OLX não publicou: ${reasons.join("; ") || "motivo não informado"}.`;
}

/** Erro que para a conexão inteira, não um carro só. */
export function describeImportStatus(response: ImportResponse): string {
  switch (response.statusCode) {
    case -2:
      return "A OLX bloqueou temporariamente por excesso de envios. Tentamos de novo na próxima sincronização.";
    case -3:
      return "Não havia anúncio para enviar.";
    case -5:
      return "O serviço de importação da OLX está fora do ar. Tentamos de novo mais tarde.";
    case -6:
      return "A conta da OLX não tem permissão de integração. A integração exige um plano profissional para Empresas (Essencial, Plus ou Premium Empresa) ativo; planos de autônomo não liberam a API.";
    case -7:
    case -8:
      return `O plano da conta na OLX está sem vaga para todos os anúncios: ${response.statusMessage}`;
    default:
      return `A OLX recusou o envio: ${response.statusMessage || `código ${response.statusCode}`}.`;
  }
}

export type ImportedAdStatus = {
  status: string;
  operation?: string;
  list_id?: string;
  url?: string;
  message?: unknown;
  image_errors?: unknown[];
};

export type ImportStatus = {
  autoupload_status: "done" | "pending";
  ads: Record<string, ImportedAdStatus>;
};

export type PublishedAd = {
  status: "pending" | "deleted" | "accepted" | "refused";
  message?: unknown;
  url?: string;
  list_id?: string;
  last_update?: string;
};

export type OlxBalance = {
  name: string;
  ads: { performed: number; available: number; total: number };
  bumps?: {
    plan?: { performed: number; available: number; total: number };
    additional?: { performed: number; available: number; total: number };
  };
  next_renew_date?: string;
};

/** "accept" também aparece nos exemplos da própria OLX para edição. */
export function isAccepted(status: string | undefined): boolean {
  return status === "accepted" || status === "accept";
}

/* ------------------------------------------------------------------------ */
/* Cliente                                                                   */
/* ------------------------------------------------------------------------ */

export class OlxClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(
    method: string,
    path: string,
    {
      body,
      bearer = false,
      soft401 = false,
    }: { body?: unknown; bearer?: boolean; soft401?: boolean } = {},
  ): Promise<{ status: number; payload: unknown }> {
    let response: Response;
    try {
      response = await this.fetcher(`${APPS}${path}`, {
        method,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(bearer ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ApiError(502, "A OLX não respondeu. Tentamos de novo na próxima sincronização.");
    }
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && !soft401) {
      throw new ApiError(401, "A OLX recusou o acesso da conta. Conecte a conta da OLX de novo.");
    }
    return { status: response.status, payload };
  }

  /** Envia o lote. Não lança em statusCode negativo: quem chama decide. */
  async importAds(adList: unknown[]): Promise<ImportResponse> {
    const { status, payload } = await this.request("PUT", "/autoupload/import", {
      body: { access_token: this.accessToken, ad_list: adList },
    });
    const body = (payload ?? {}) as Partial<ImportResponse>;
    if (typeof body.statusCode !== "number") {
      throw new ApiError(502, `A OLX respondeu fora do formato ao envio (HTTP ${status}).`);
    }
    return {
      token: body.token ?? null,
      statusCode: body.statusCode,
      statusMessage: body.statusMessage ?? "",
      errors: Array.isArray(body.errors) ? body.errors : [],
    };
  }

  /** O token do lote vale 7 dias; depois disso, 404 (devolvemos null). */
  async importStatus(token: string): Promise<ImportStatus | null> {
    const { status, payload } = await this.request("POST", `/autoupload/import/${token}`, {
      body: { access_token: this.accessToken },
    });
    if (status === 404) return null;
    if (status >= 400 || !payload) {
      throw new ApiError(502, `A OLX não informou o status do envio (HTTP ${status}).`);
    }
    return payload as ImportStatus;
  }

  async adStatus(listId: string): Promise<PublishedAd | null> {
    const { status, payload } = await this.request("GET", `/autoupload/ads/${listId}`, {
      bearer: true,
    });
    if (status === 404) return null;
    if (status >= 400 || !payload) {
      throw new ApiError(502, `A OLX não informou a situação do anúncio (HTTP ${status}).`);
    }
    return payload as PublishedAd;
  }

  /** Catálogo: marcas, modelos de uma marca, versões de um modelo. */
  async carInfo(brandId?: string, modelId?: string): Promise<CatalogEntry[]> {
    const path = ["/autoupload/car_info", brandId, modelId].filter(Boolean).join("/");
    const { status, payload } = await this.request("POST", path, {
      body: { access_token: this.accessToken },
    });
    const body = payload as { status?: string; data?: Record<string, number | string> } | null;
    if (status >= 400 || !body?.data) {
      throw new ApiError(502, `A OLX não entregou o catálogo de veículos (HTTP ${status}).`);
    }
    return Object.entries(body.data).map(([name, id]) => ({ id: String(id), name }));
  }

  /** Plano, vagas e saldo de destaques. Null quando a conta não tem plano com limite. */
  async balance(): Promise<OlxBalance | null> {
    const { status, payload } = await this.request("GET", "/autoupload/balance", { bearer: true });
    if (status === 410) return null;
    if (status >= 400 || !payload) {
      throw new ApiError(502, `A OLX não informou o saldo do plano (HTTP ${status}).`);
    }
    return payload as OlxBalance;
  }

  /** Destaque (volta ao topo). Devolve as próximas voltas agendadas. */
  async bump(listId: string): Promise<string[]> {
    const { status, payload } = await this.request("PUT", `/autoupload/v1/bump/ad/${listId}`, {
      bearer: true,
    });
    const body = (payload ?? {}) as { next_bumps?: string[]; reason?: string };
    if (status === 200) return body.next_bumps ?? [];
    const reasons: Record<number, string> = {
      403: "o plano da conta na OLX está sem saldo de destaques",
      404: "a OLX não encontrou o anúncio (ele já foi aprovado?)",
      422: "este anúncio já está em destaque; a OLX só permite um novo destaque 7 dias depois",
      429: "muitas tentativas seguidas; tente em instantes",
    };
    throw new ApiError(
      status === 403 || status === 422 ? 409 : 502,
      `Não deu para destacar: ${reasons[status] ?? `HTTP ${status}`}.`,
    );
  }

  /**
   * Cadastra (ou atualiza) a URL que recebe os leads desta conta. Exige o
   * escopo `autoservice`; sem ele a OLX devolve 401 e a loja cadastra a URL
   * à mão.
   */
  async configureLeads(url: string, existingId?: string): Promise<string> {
    const { status, payload } = existingId
      ? await this.request("PUT", `/autoservice/v1/lead/${existingId}`, {
          body: { url },
          bearer: true,
          soft401: true,
        })
      : await this.request("POST", "/autoservice/v1/lead", {
          body: { url },
          bearer: true,
          soft401: true,
        });
    if (status === 401) {
      throw new ApiError(
        409,
        "A autorização da OLX não incluiu a configuração de leads. Cadastre o endereço de leads com o suporte da OLX.",
      );
    }
    const body = (payload ?? {}) as { id?: string };
    if (status >= 400 || !body.id) {
      throw new ApiError(502, `A OLX não aceitou o endereço de leads (HTTP ${status}).`);
    }
    return body.id;
  }
}
