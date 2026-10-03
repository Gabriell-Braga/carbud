import { describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/db/schema";
import {
  OlxClient,
  describeImportStatus,
  describeProcessing,
  describeValidation,
  olxAd,
  olxAdId,
  olxColor,
  olxDoors,
  olxMotorPower,
  olxPhone,
  olxRegdate,
} from "./olx";

const vehicle = {
  id: "0f6b7c1e-3d2a-4b8c-9e1f-2a3b4c5d6e7f",
  brand: "Volkswagen",
  model: "Gol",
  version: "1.0 MPI Total Flex Manual",
  yearManufacture: 2019,
  yearModel: 2020,
  mileageKm: 45000,
  priceCents: 5590000,
  priceOnRequest: false,
  transmission: "manual",
  fuel: "flex",
  bodyType: "hatch",
  color: "Prata metálico",
  doors: 4,
  licensePlate: "abc1d23",
  options: ["ar-condicionado", "direcao-hidraulica", "vidros-eletricos", "camera-re"],
  description: "Único dono, revisado.",
} as unknown as Vehicle;

const input = {
  vehicle,
  pictureUrls: ["https://x/1.jpg", "https://x/2.jpg", "https://x/1.jpg"],
  phone: "5531988887777",
  zip: "30110-000",
  catalog: { brand: "60", model: "12", version: "7" },
};

describe("olxAd", () => {
  it("monta o anúncio com os códigos da tabela da OLX", () => {
    const ad = olxAd(input);
    expect(ad).toMatchObject({
      id: olxAdId(vehicle.id),
      operation: "insert",
      category: 2020,
      phone: 31988887777,
      type: "s",
      price: 55900,
      zipcode: "30110000",
      images: ["https://x/1.jpg", "https://x/2.jpg"],
    });
    expect(ad.params).toEqual({
      vehicle_brand: "60",
      vehicle_model: "12",
      vehicle_version: "7",
      regdate: "2020",
      mileage: 45000,
      vehicle_tag: "ABC1D23",
      gearbox: "1",
      fuel: "3",
      cartype: "9",
      carcolor: "3",
      doors: "2",
      motorpower: "1",
      car_steering: "1",
      car_features: ["1", "3", "9"],
    });
  });

  it("nunca manda parâmetro opcional vazio (a OLX derruba o lote)", () => {
    const ad = olxAd({
      ...input,
      vehicle: { ...vehicle, color: null, doors: null, options: [] } as Vehicle,
    });
    expect(ad.params).not.toHaveProperty("carcolor");
    expect(ad.params).not.toHaveProperty("doors");
    expect(ad.params).not.toHaveProperty("car_features");
  });

  it("GNV vai como gasolina com kit, porque o código 4 foi descontinuado", () => {
    const ad = olxAd({ ...input, vehicle: { ...vehicle, fuel: "gnv" } as Vehicle });
    expect(ad.params.fuel).toBe("1");
    expect(ad.params.gnv_kit).toBe("1");
  });

  it("recusa antes da OLX o que ela recusaria, com a frase de onde mexer", () => {
    expect(() =>
      olxAd({ ...input, vehicle: { ...vehicle, licensePlate: null } as Vehicle }),
    ).toThrow(/placa/);
    expect(() => olxAd({ ...input, zip: null })).toThrow(/CEP/);
    expect(() => olxAd({ ...input, phone: "123" })).toThrow(/telefone/);
    expect(() =>
      olxAd({ ...input, vehicle: { ...vehicle, priceOnRequest: true } as Vehicle }),
    ).toThrow(/preço/);
  });

  it("zero km não precisa de placa", () => {
    const ad = olxAd({
      ...input,
      vehicle: { ...vehicle, mileageKm: 0, licensePlate: null } as Vehicle,
    });
    expect(ad.params.zero_km).toBe("1");
    expect(ad.params).not.toHaveProperty("vehicle_tag");
  });
});

describe("tabelas da OLX", () => {
  it("o id cabe nas regras da OLX e é sempre o mesmo para o carro", () => {
    expect(olxAdId(vehicle.id)).toMatch(/^[A-Za-z0-9_{}-]{1,19}$/);
    expect(olxAdId(vehicle.id)).toBe(olxAdId(vehicle.id));
  });

  it("converte o que vem do cadastro", () => {
    expect(olxColor("Preto Ninja")).toBe("1");
    expect(olxColor("Champagne")).toBe("10");
    expect(olxDoors(5)).toBe("2");
    expect(olxDoors(2)).toBe("1");
    expect(olxMotorPower("2.0 TSI")).toBe("10");
    expect(olxMotorPower("1.6 16V")).toBe("6");
    expect(olxMotorPower("Turbo")).toBeNull();
    expect(olxRegdate(1978)).toBe("1975");
    expect(olxPhone("(31) 3333-4444")).toBe(3133334444);
  });

  it("traduz os códigos de recusa", () => {
    expect(describeValidation(["ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID"])).toContain(
      "catálogo da OLX",
    );
    expect(describeProcessing([{ error: "REFUSED_SUSPECT_PRICE" }])).toContain("preço");
    expect(
      describeImportStatus({
        token: null,
        statusCode: -6,
        statusMessage: "Without permission",
        errors: [],
      }),
    ).toContain("plano profissional para Empresas");
  });
});

describe("OlxClient", () => {
  it("manda o lote por PUT com o token no corpo e User-Agent", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ token: "t1", statusCode: 0, statusMessage: "ok", errors: [] }),
        ),
      );
    const client = new OlxClient("tok", fetcher as unknown as typeof fetch);
    const response = await client.importAds([{ id: "1", operation: "delete" }]);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://apps.olx.com.br/autoupload/import");
    expect(init.method).toBe("PUT");
    expect(init.headers["User-Agent"]).toBeTruthy();
    expect(JSON.parse(init.body)).toEqual({
      access_token: "tok",
      ad_list: [{ id: "1", operation: "delete" }],
    });
    expect(response.token).toBe("t1");
  });

  it("destaque sem saldo vira frase, não código", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ reason: "FORBIDDEN" }), { status: 403 }));
    const client = new OlxClient("tok", fetcher as unknown as typeof fetch);
    await expect(client.bump("123")).rejects.toMatchObject({
      message: expect.stringContaining("sem saldo"),
    });
    expect(fetcher.mock.calls[0][0]).toBe("https://apps.olx.com.br/autoupload/v1/bump/ad/123");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("lê o catálogo no formato nome → id", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: "ok", data: { AUDI: 6, BMW: 7 } })));
    const client = new OlxClient("tok", fetcher as unknown as typeof fetch);
    expect(await client.carInfo("6")).toEqual([
      { id: "6", name: "AUDI" },
      { id: "7", name: "BMW" },
    ]);
    expect(fetcher.mock.calls[0][0]).toBe("https://apps.olx.com.br/autoupload/car_info/6");
  });
});
