import type { Vehicle } from "@/db/schema";
import { ApiError } from "@/lib/http";
import type { CatalogEntry } from "./catalog-match";

/**
 * API de veículos do Chaves na Mão (REST, v2).
 *
 * Documentação pública: https://tecnologiacnm.github.io/cnm-vehicle-api-documentation/
 *
 * A loja gera o "Token de integração" na própria conta (Meus dados), sem
 * acordo nosso com o portal. O token vira um JWT de um dia em /clients/jwt.
 * Escritas (POST, PUT, DELETE) entram numa fila do portal e voltam 202: o
 * anúncio aparece em até 45 minutos. Criar já publica, se houver vaga no
 * plano; apagar o veículo também despublica.
 */

const BASE_URL = "https://api.chavesnamao.com.br/integration/v2";

/** Placa no formato que o portal aceita: Mercosul ou antiga, sem hífen. */
const PLATE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

type Color =
  | "BLACK"
  | "WHITE"
  | "RED"
  | "SILVER"
  | "GREEN"
  | "YELLOW"
  | "BLUE"
  | "METALLIC_WHITE"
  | "GREY"
  | "LEAD"
  | "BEIGE"
  | "ORANGE"
  | "BURGUNDY"
  | "BROWN"
  | "GOLDEN"
  | "PURPLE"
  | "PINK"
  | "OTHER"
  | "WINE"
  | "PEARL_WHITE"
  | "CHAMPAGNE"
  | "BRONZE";

/** Ordem importa: "branco perolizado" precisa casar antes de "branco". */
const COLORS: [RegExp, Color][] = [
  [/^branc\w* perol/, "PEARL_WHITE"],
  [/^branc\w* metal/, "METALLIC_WHITE"],
  [/^branc/, "WHITE"],
  [/^pret/, "BLACK"],
  [/^vermelh/, "RED"],
  [/^prat/, "SILVER"],
  [/^verde/, "GREEN"],
  [/^amarel/, "YELLOW"],
  [/^azul/, "BLUE"],
  [/^cinza/, "GREY"],
  [/^chumbo|^grafite/, "LEAD"],
  [/^bege/, "BEIGE"],
  [/^laranj/, "ORANGE"],
  [/^bord/, "BURGUNDY"],
  [/^marrom/, "BROWN"],
  [/^dourad/, "GOLDEN"],
  [/^rox/, "PURPLE"],
  [/^rosa/, "PINK"],
  [/^vinho/, "WINE"],
  [/^champa/, "CHAMPAGNE"],
  [/^bronze/, "BRONZE"],
];

/** Cor livre da ficha → cor do portal. O que não casa vai como "Outra cor". */
export function cnmColor(color: string | null): Color {
  const value = (color ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return COLORS.find(([pattern]) => pattern.test(value))?.[1] ?? "OTHER";
}

const FUELS: Record<string, string> = {
  flex: "FLEX",
  gasolina: "GASOLINE",
  etanol: "ETHANOL",
  diesel: "DIESEL",
  gnv: "GNV",
  hibrido: "HYBRID",
  // é assim mesmo na API deles
  eletrico: "ELETRIC",
};

export function cnmFuel(fuel: string | null): string | null {
  return fuel ? (FUELS[fuel] ?? null) : null;
}

/** O portal só conhece manual e automático; automatizado e CVT são automáticos. */
export function cnmGearbox(transmission: string | null): "MANUAL" | "AUTOMATIC" | null {
  if (!transmission) return null;
  return transmission === "manual" ? "MANUAL" : "AUTOMATIC";
}

export type CnmCodes = { trimId: number; accessories: number[] };

/**
 * O corpo do POST/PUT /vehicles. Valida aqui o que o portal recusaria, com
 * a frase que diz o que corrigir na ficha — o 400 deles fala em nome de campo.
 */
export function vehiclePayload(
  vehicle: Pick<
    Vehicle,
    | "id"
    | "brand"
    | "model"
    | "version"
    | "yearManufacture"
    | "yearModel"
    | "mileageKm"
    | "licensePlate"
    | "doors"
    | "color"
    | "fuel"
    | "transmission"
    | "priceCents"
    | "priceOnRequest"
    | "description"
  >,
  codes: CnmCodes,
  pictures: string[],
) {
  if (vehicle.priceOnRequest || vehicle.priceCents <= 0) {
    throw new ApiError(400, "O Chaves na Mão exige preço; este veículo está como 'sob consulta'.");
  }
  if (pictures.length === 0) throw new ApiError(400, "O Chaves na Mão exige pelo menos uma foto.");
  if (vehicle.mileageKm === null) {
    throw new ApiError(
      400,
      "O Chaves na Mão exige a quilometragem. Preencha na ficha (0 para 0 km).",
    );
  }
  if (!vehicle.doors || vehicle.doors < 2 || vehicle.doors > 5) {
    throw new ApiError(400, "O Chaves na Mão exige o número de portas (2 a 5). Preencha na ficha.");
  }
  const fuel = cnmFuel(vehicle.fuel);
  if (!fuel) throw new ApiError(400, "O Chaves na Mão exige o combustível. Preencha na ficha.");
  const gearbox = cnmGearbox(vehicle.transmission);
  if (!gearbox) throw new ApiError(400, "O Chaves na Mão exige o câmbio. Preencha na ficha.");

  const plate = (vehicle.licensePlate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vehicle.mileageKm > 0 && !PLATE.test(plate)) {
    throw new ApiError(
      400,
      "O Chaves na Mão exige a placa completa de carro usado. Preencha a placa na ficha.",
    );
  }

  const title = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ");
  return {
    reference: vehicle.id,
    type: "C",
    trimId: codes.trimId,
    manufacturedYear: vehicle.yearManufacture,
    modelYear: vehicle.yearModel,
    mileage: vehicle.mileageKm,
    licensePlate: plate,
    doors: vehicle.doors,
    color: cnmColor(vehicle.color),
    fuel,
    gearbox,
    value: vehicle.priceCents / 100,
    // financiamento não é informado aqui: zero é o "não tem" do portal
    deposit: 0,
    amountPerInstallment: 0,
    amountOfInstallments: 0,
    accessories: codes.accessories,
    pictures: pictures.slice(0, 16).map((source) => ({ source })),
    title: title.slice(0, 100),
    ...(vehicle.description?.trim()
      ? { description: vehicle.description.trim().slice(0, 4000) }
      : {}),
  };
}

export type CnmPlan = { adsAvailable: number };

type Fetch = typeof fetch;

export class ChavesNaMaoClient {
  private constructor(
    private readonly jwt: string,
    private readonly fetcher: Fetch,
  ) {}

  /** Troca o token de integração da loja pelo JWT. Token errado vira 401. */
  static async open(token: string, fetcher: Fetch = fetch): Promise<ChavesNaMaoClient> {
    const response = await fetcher(`${BASE_URL}/clients/jwt`, { headers: { token } });
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new ApiError(
        401,
        "O Chaves na Mão recusou o token de integração. Copie de novo em Meus dados → Token de integração e conecte outra vez.",
      );
    }
    if (!response.ok) throw await portalError(response);
    const body = (await response.json()) as { token?: string };
    if (!body.token) throw new ApiError(502, "O Chaves na Mão não devolveu o acesso.");
    return new ChavesNaMaoClient(body.token, fetcher);
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<Response> {
    const response = await this.fetcher(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // limite de requisições: o portal diz quanto esperar (até 10 s)
    if (response.status === 429 && !retried) {
      const wait = Math.min(Number(response.headers.get("retry-after")) || 10, 10);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      return this.call(method, path, body, true);
    }
    if (response.status === 401) {
      throw new ApiError(401, "O acesso ao Chaves na Mão venceu ou foi revogado. Conecte de novo.");
    }
    return response;
  }

  private async json<T>(path: string): Promise<T> {
    const response = await this.call("GET", path);
    if (!response.ok) throw await portalError(response);
    return (await response.json()) as T;
  }

  async plan(): Promise<CnmPlan> {
    const body = await this.json<{ available?: { adsQuantity?: number } }>("/clients/plan");
    return { adsAvailable: body.available?.adsQuantity ?? 0 };
  }

  brands = () => this.entries("/vehicles/brands?vehicleType=C");
  models = (brandId: string) => this.entries(`/vehicles/brands/${brandId}/models`);
  trims = (modelId: string) => this.entries(`/vehicles/models/${modelId}/trims`);
  accessories = () => this.entries("/vehicles/accessories?vehicleType=C");

  private async entries(path: string): Promise<CatalogEntry[]> {
    const rows = await this.json<{ id: number; name: string }[]>(path);
    return rows.map((row) => ({ id: String(row.id), name: row.name }));
  }

  async create(payload: ReturnType<typeof vehiclePayload>): Promise<void> {
    const response = await this.call("POST", "/vehicles", payload);
    if (!response.ok) throw await portalError(response);
  }

  /** Falso quando o veículo não existe mais lá (apagado no portal): aí é recriar. */
  async update(payload: ReturnType<typeof vehiclePayload>): Promise<boolean> {
    const { reference, ...rest } = payload;
    const response = await this.call("PUT", `/vehicles/${encodeURIComponent(reference)}`, rest);
    if (response.status === 404) return false;
    if (!response.ok) throw await portalError(response);
    return true;
  }

  /** Apaga e despublica. Já não existir lá é o resultado que se queria. */
  async remove(reference: string): Promise<void> {
    const response = await this.call("DELETE", `/vehicles/${encodeURIComponent(reference)}`);
    if (response.status === 404) return;
    if (!response.ok) throw await portalError(response);
  }
}

/** O 400/422 deles é do NestJS: `message` é texto ou lista de textos. */
async function portalError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const detail = Array.isArray(body?.message)
    ? body.message.join("; ")
    : typeof body?.message === "string"
      ? body.message
      : `HTTP ${response.status}`;
  const status = response.status >= 500 ? 502 : response.status === 422 ? 400 : response.status;
  return new ApiError(status, `Chaves na Mão: ${detail}`);
}
