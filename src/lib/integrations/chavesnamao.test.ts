import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import { ChavesNaMaoClient, cnmColor, cnmGearbox, vehiclePayload } from "./chavesnamao";

const vehicle = {
  id: "veh_1",
  brand: "Volkswagen",
  model: "Gol",
  version: "1.0 MPI Flex",
  yearManufacture: 2019,
  yearModel: 2020,
  mileageKm: 45000,
  licensePlate: "abc-1d23",
  doors: 4,
  color: "Branco Perolizado",
  fuel: "flex" as const,
  transmission: "automatizado" as const,
  priceCents: 5590050,
  priceOnRequest: false,
  description: "Revisado",
};
const codes = { trimId: 77, accessories: [3, 6] };

describe("vehiclePayload", () => {
  it("monta o corpo que a API documenta", () => {
    expect(vehiclePayload(vehicle, codes, ["https://x/1.jpg"])).toEqual({
      reference: "veh_1",
      type: "C",
      trimId: 77,
      manufacturedYear: 2019,
      modelYear: 2020,
      mileage: 45000,
      licensePlate: "ABC1D23",
      doors: 4,
      color: "PEARL_WHITE",
      fuel: "FLEX",
      gearbox: "AUTOMATIC",
      value: 55900.5,
      deposit: 0,
      amountPerInstallment: 0,
      amountOfInstallments: 0,
      accessories: [3, 6],
      pictures: [{ source: "https://x/1.jpg" }],
      title: "Volkswagen Gol 1.0 MPI Flex",
      description: "Revisado",
    });
  });

  it("no máximo 16 fotos", () => {
    const photos = Array.from({ length: 20 }, (_, index) => `https://x/${index}.jpg`);
    expect(vehiclePayload(vehicle, codes, photos).pictures).toHaveLength(16);
  });

  it("recusa com o motivo o que o portal recusaria", () => {
    expect(() => vehiclePayload({ ...vehicle, priceOnRequest: true }, codes, ["u"])).toThrow(
      /preço/,
    );
    expect(() => vehiclePayload(vehicle, codes, [])).toThrow(/foto/);
    expect(() => vehiclePayload({ ...vehicle, licensePlate: null }, codes, ["u"])).toThrow(/placa/);
    expect(() => vehiclePayload({ ...vehicle, doors: null }, codes, ["u"])).toThrow(/portas/);
    expect(() => vehiclePayload({ ...vehicle, fuel: null }, codes, ["u"])).toThrow(/combustível/);
  });

  it("0 km dispensa a placa", () => {
    const novo = vehiclePayload({ ...vehicle, mileageKm: 0, licensePlate: null }, codes, ["u"]);
    expect(novo.mileage).toBe(0);
  });
});

describe("mapeamentos", () => {
  it("cor livre vira a do portal, e o resto vira OTHER", () => {
    expect(cnmColor("preto metálico")).toBe("BLACK");
    expect(cnmColor("Branco")).toBe("WHITE");
    expect(cnmColor("grafite")).toBe("LEAD");
    expect(cnmColor("furta-cor")).toBe("OTHER");
    expect(cnmColor(null)).toBe("OTHER");
  });

  it("só manual é manual", () => {
    expect(cnmGearbox("manual")).toBe("MANUAL");
    expect(cnmGearbox("cvt")).toBe("AUTOMATIC");
    expect(cnmGearbox(null)).toBeNull();
  });
});

describe("ChavesNaMaoClient", () => {
  it("troca o token pelo JWT e usa nas chamadas", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: "jwt", expiration: "1d" }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = await ChavesNaMaoClient.open("tok", fetcher);
    await client.remove("veh_1");

    expect(fetcher.mock.calls[0][1].headers).toEqual({ token: "tok" });
    expect(fetcher.mock.calls[1][0]).toMatch(/\/vehicles\/veh_1$/);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer jwt");
  });

  it("token recusado é 401: só reconectar resolve", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    const error = await ChavesNaMaoClient.open("x", fetcher).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it("update de veículo que sumiu do portal pede recriação; erro de validação vem com o motivo", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: "jwt" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({ message: ["trimId must be a number"] }, { status: 400 }),
      );
    const client = await ChavesNaMaoClient.open("tok", fetcher);
    const payload = vehiclePayload(vehicle, codes, ["u"]);

    expect(await client.update(payload)).toBe(false);
    await expect(client.create(payload)).rejects.toThrow("Chaves na Mão: trimId must be a number");
  });
});
