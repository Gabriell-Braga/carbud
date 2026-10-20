/**
 * Feed de estoque para classificados.
 *
 * A maioria dos portais brasileiros importa por URL — a revenda cadastra um
 * endereço lá e eles buscam sozinhos, de tempos em tempos. Isso permite deixar
 * a integração pronta ANTES de existir contrato: quando o contrato sair, é
 * colar o endereço, sem tocar em código.
 *
 * Não existe formato único no mercado, então o feed leva todos os campos com
 * nomes descritivos, que é o que os portais pedem para mapear.
 */

export type FeedVehicle = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  version: string | null;
  yearManufacture: number;
  yearModel: number;
  mileageKm: number | null;
  priceCents: number;
  priceOnRequest: boolean;
  transmission: string | null;
  fuel: string | null;
  bodyType: string | null;
  color: string | null;
  doors: number | null;
  licensePlateEnd: string | null;
  options: string[];
  description: string | null;
  status: string;
  fipeCode: string | null;
  photos: string[];
  updatedAt: Date;
};

export type FeedStore = {
  name: string;
  slug: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  /** Rua e número, numa linha só. */
  street?: string | null;
  zip?: string | null;
};

/** Controles inválidos em XML 1.0, exceto tab, LF e CR. */
const CONTROL_CHARS = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F]", "g");

/**
 * Escapa texto para XML.
 *
 * Descrição de veículo tem "&", aspas e, de vez em quando, "<" — um único "&"
 * não escapado quebra o arquivo inteiro, e o portal rejeita o estoque completo
 * por causa de um anúncio. O erro chega como "feed inválido", sem dizer onde.
 */
export function escapeXml(value: string): string {
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(
  name: string,
  value: string | number | null | undefined,
  indent = "      ",
): string {
  if (value === null || value === undefined || value === "") return "";
  return `${indent}<${name}>${escapeXml(String(value))}</${name}>\n`;
}

/** Reais com duas casas e ponto decimal — é o que os portais esperam. */
export function formatFeedPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function buildStockXml(
  store: FeedStore,
  vehicles: FeedVehicle[],
  generatedAt: Date,
): string {
  const items = vehicles
    .map((vehicle) => {
      const title = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ");
      const photos = vehicle.photos
        .map((url) => `        <foto>${escapeXml(url)}</foto>\n`)
        .join("");
      const options = vehicle.options
        .map((option) => `        <opcional>${escapeXml(option)}</opcional>\n`)
        .join("");

      // sob consulta vai SEM preço, nunca com zero: zero é lido como grátis
      const price = vehicle.priceOnRequest
        ? tag("preco_sob_consulta", "true")
        : tag("preco", formatFeedPrice(vehicle.priceCents));

      return (
        "    <veiculo>\n" +
        tag("id", vehicle.id) +
        tag("titulo", title) +
        tag("marca", vehicle.brand) +
        tag("modelo", vehicle.model) +
        tag("versao", vehicle.version) +
        tag("ano_fabricacao", vehicle.yearManufacture) +
        tag("ano_modelo", vehicle.yearModel) +
        tag("quilometragem", vehicle.mileageKm) +
        price +
        tag("cambio", vehicle.transmission) +
        tag("combustivel", vehicle.fuel) +
        tag("carroceria", vehicle.bodyType) +
        tag("cor", vehicle.color) +
        tag("portas", vehicle.doors) +
        tag("final_placa", vehicle.licensePlateEnd) +
        tag("codigo_fipe", vehicle.fipeCode) +
        tag("situacao", vehicle.status) +
        tag("descricao", vehicle.description) +
        tag("atualizado_em", vehicle.updatedAt.toISOString()) +
        (options ? `      <opcionais>\n${options}      </opcionais>\n` : "") +
        (photos ? `      <fotos>\n${photos}      </fotos>\n` : "") +
        "    </veiculo>\n"
      );
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<estoque>\n" +
    "  <revenda>\n" +
    tag("nome", store.name, "    ") +
    tag("telefone", store.phone, "    ") +
    tag("whatsapp", store.whatsapp, "    ") +
    tag("email", store.email, "    ") +
    tag("cidade", store.city, "    ") +
    tag("estado", store.state, "    ") +
    `    <gerado_em>${generatedAt.toISOString()}</gerado_em>\n` +
    `    <total>${vehicles.length}</total>\n` +
    "  </revenda>\n" +
    "  <veiculos>\n" +
    items +
    "  </veiculos>\n" +
    "</estoque>\n"
  );
}

export function buildStockJson(
  store: FeedStore,
  vehicles: FeedVehicle[],
  generatedAt: Date,
): Record<string, unknown> {
  return {
    revenda: {
      nome: store.name,
      telefone: store.phone,
      whatsapp: store.whatsapp,
      email: store.email,
      cidade: store.city,
      estado: store.state,
    },
    geradoEm: generatedAt.toISOString(),
    total: vehicles.length,
    veiculos: vehicles.map((vehicle) => ({
      id: vehicle.id,
      titulo: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" "),
      marca: vehicle.brand,
      modelo: vehicle.model,
      versao: vehicle.version,
      anoFabricacao: vehicle.yearManufacture,
      anoModelo: vehicle.yearModel,
      quilometragem: vehicle.mileageKm,
      preco: vehicle.priceOnRequest ? null : Number(formatFeedPrice(vehicle.priceCents)),
      precoSobConsulta: vehicle.priceOnRequest,
      cambio: vehicle.transmission,
      combustivel: vehicle.fuel,
      carroceria: vehicle.bodyType,
      cor: vehicle.color,
      portas: vehicle.doors,
      finalPlaca: vehicle.licensePlateEnd,
      codigoFipe: vehicle.fipeCode,
      situacao: vehicle.status,
      opcionais: vehicle.options,
      descricao: vehicle.description,
      fotos: vehicle.photos,
      atualizadoEm: vehicle.updatedAt.toISOString(),
    })),
  };
}
