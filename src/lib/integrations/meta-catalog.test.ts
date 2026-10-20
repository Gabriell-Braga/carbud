import { describe, expect, it } from "vitest";
import { buildMetaCatalogXml } from "./meta-catalog";
import type { FeedStore, FeedVehicle } from "./stock-feed";

const store: FeedStore = {
  name: "Revenda & Cia",
  slug: "revenda",
  phone: null,
  whatsapp: null,
  email: null,
  city: "São Paulo",
  state: "SP",
  street: "Rua A, 10",
  zip: "01000-000",
};

function vehicle(overrides: Partial<FeedVehicle> = {}): FeedVehicle {
  return {
    id: "v1",
    slug: "onix-2022",
    brand: "Chevrolet",
    model: "Onix",
    version: "1.0 LT",
    yearManufacture: 2021,
    yearModel: 2022,
    mileageKm: 34000,
    priceCents: 7_990_000,
    priceOnRequest: false,
    transmission: "cvt",
    fuel: "flex",
    bodyType: "picape",
    color: null,
    doors: 4,
    licensePlateEnd: null,
    options: [],
    description: null,
    status: "reserved",
    fipeCode: null,
    photos: ["https://x/1.jpg"],
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const options = { siteOrigin: "https://loja.com.br", pageId: "123456789", privacyUrl: null };

describe("buildMetaCatalogXml", () => {
  it("traduz para os enums e o formato de preço da Meta", () => {
    const xml = buildMetaCatalogXml(store, [vehicle()], options);
    expect(xml).toContain("<price>79900.00 BRL</price>");
    expect(xml).toContain("<body_style>TRUCK</body_style>");
    expect(xml).toContain("<transmission>Automatic</transmission>");
    expect(xml).toContain("<fuel_type>FLEX</fuel_type>");
    expect(xml).toContain("<availability>not_available</availability>");
    expect(xml).toContain("<url>https://loja.com.br/veiculo/onix-2022</url>");
    expect(xml).toContain("<title>Revenda &amp; Cia</title>");
    expect(xml).not.toContain("LEAD_FORM");
  });

  it("deixa de fora carro sem foto ou com preço sob consulta", () => {
    const xml = buildMetaCatalogXml(
      store,
      [vehicle({ id: "a", photos: [] }), vehicle({ id: "b", priceOnRequest: true })],
      options,
    );
    expect(xml).not.toContain("<listing>");
  });
});
