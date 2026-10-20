import type { BodyType, Fuel, Transmission } from "@carbud/site-kit/catalog";
import { escapeXml, formatFeedPrice, type FeedStore, type FeedVehicle } from "./stock-feed";

/**
 * Catálogo de veículos da Meta (anúncios de estoque automotivo no Facebook e
 * no Instagram), no XML `<listings>` que o Gerenciador de Catálogos importa
 * por URL agendada.
 *
 * Referência: developers.facebook.com → Marketing API → Auto Ads → Feed XML.
 * Mesmo formato do feed que a Unidas Seminovos publica.
 */

/*
 * Os enums da Meta são estreitos: o que não tem par vira OTHER, que ela
 * aceita. Picape é TRUCK no vocabulário americano; utilitário de carga, VAN.
 */
const BODY_STYLE: Record<BodyType, string> = {
  hatch: "HATCHBACK",
  sedan: "SEDAN",
  suv: "SUV",
  picape: "TRUCK",
  minivan: "MINIVAN",
  cupe: "COUPE",
  conversivel: "CONVERTIBLE",
  utilitario: "VAN",
};

const FUEL_TYPE: Record<Fuel, string> = {
  flex: "FLEX",
  gasolina: "GASOLINE",
  etanol: "OTHER",
  diesel: "DIESEL",
  gnv: "OTHER",
  hibrido: "HYBRID",
  eletrico: "ELECTRIC",
};

// a Meta só conhece manual e automático; automatizado e CVT não têm pedal
const TRANSMISSION: Record<Transmission, string> = {
  manual: "Manual",
  automatico: "Automatic",
  automatizado: "Automatic",
  cvt: "Automatic",
};

const MAX_IMAGES = 20;

export type MetaCatalogOptions = {
  /** Origem pública do site da revenda: o `url` do anúncio leva para a ficha lá. */
  siteOrigin: string;
  /** Id da página do Facebook; sem ele o anúncio não roda dentro do Facebook. */
  pageId: string | null;
  /** Política de privacidade da revenda, exigida pelo formulário de lead. */
  privacyUrl: string | null;
};

/**
 * Veículo que não cumpre o mínimo da Meta fica de fora.
 *
 * Um item inválido não derruba o catálogo, mas aparece como erro no
 * Gerenciador e a revenda não sabe o que fazer com ele. Preço é obrigatório
 * (sob consulta não tem como anunciar), e imagem também.
 */
export function isMetaEligible(vehicle: FeedVehicle): boolean {
  return !vehicle.priceOnRequest && vehicle.priceCents > 0 && vehicle.photos.length > 0;
}

function tag(name: string, value: string | number | null | undefined, indent = "    "): string {
  if (value === null || value === undefined || value === "") return "";
  return `${indent}<${name}>${escapeXml(String(value))}</${name}>\n`;
}

function component(name: string, value: string | null | undefined): string {
  if (!value) return "";
  return `      <component name="${name}">${escapeXml(value)}</component>\n`;
}

export function buildMetaCatalogXml(
  store: FeedStore,
  vehicles: FeedVehicle[],
  options: MetaCatalogOptions,
): string {
  const address =
    '    <address format="simple">\n' +
    component("addr1", store.street) +
    component("city", store.city) +
    component("region", store.state) +
    component("country", "BR") +
    component("postal_code", store.zip) +
    "    </address>\n";

  const items = vehicles
    .filter(isMetaEligible)
    .map((vehicle) => {
      const title = [vehicle.brand, vehicle.model, vehicle.version, vehicle.yearModel]
        .filter(Boolean)
        .join(" ");
      // descrição é obrigatória; sem texto da revenda, os opcionais dizem algo
      const description =
        vehicle.description?.trim() || vehicle.options.join(", ") || title;
      const images = vehicle.photos
        .slice(0, MAX_IMAGES)
        .map((url) => `    <image>\n      <url>${escapeXml(url)}</url>\n    </image>\n`)
        .join("");

      return (
        "  <listing>\n" +
        tag("vehicle_id", vehicle.id) +
        tag("title", title) +
        tag("description", description.slice(0, 5000)) +
        tag("url", `${options.siteOrigin}/veiculo/${vehicle.slug}`) +
        tag("make", vehicle.brand) +
        tag("model", vehicle.model) +
        tag("trim", vehicle.version?.slice(0, 50)) +
        tag("year", vehicle.yearModel) +
        "    <mileage>\n" +
        tag("value", vehicle.mileageKm ?? 0, "      ") +
        tag("unit", "KM", "      ") +
        "    </mileage>\n" +
        tag("body_style", vehicle.bodyType ? BODY_STYLE[vehicle.bodyType as BodyType] : "OTHER") +
        tag("fuel_type", vehicle.fuel ? FUEL_TYPE[vehicle.fuel as Fuel] : null) +
        tag(
          "transmission",
          vehicle.transmission ? TRANSMISSION[vehicle.transmission as Transmission] : null,
        ) +
        tag("price", `${formatFeedPrice(vehicle.priceCents)} BRL`) +
        address +
        tag("exterior_color", vehicle.color ?? "Não informada") +
        tag("state_of_vehicle", vehicle.mileageKm === 0 ? "New" : "Used") +
        // reservado continua no site, mas anunciar carro que já tem dono queima verba
        tag("availability", vehicle.status === "available" ? "available" : "not_available") +
        tag("fb_page_id", options.pageId) +
        (options.privacyUrl
          ? tag("dealer_communication_channel", "LEAD_FORM") +
            tag("dealer_privacy_policy_url", options.privacyUrl)
          : "") +
        images +
        "  </listing>\n"
      );
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<listings>\n" +
    tag("title", store.name, "  ") +
    `  <link rel="self" href="${escapeXml(options.siteOrigin)}" />\n` +
    items +
    "</listings>\n"
  );
}
