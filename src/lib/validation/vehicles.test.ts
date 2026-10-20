import { describe, expect, it } from "vitest";
import { BODY_TYPES } from "@/db/schema";
import { vehicleSchema, vehicleUpdateSchema } from "./vehicles";

const base = {
  brand: "Ford",
  model: "Fiesta",
  version: "Sedan SE 1.6",
  yearManufacture: 2014,
  yearModel: 2014,
  mileageKm: 98000,
  priceCents: 3790000,
  bodyType: "sedan",
  status: "available",
};

describe("atualização do veículo", () => {
  /*
   * Quebrou em produção: escolher "Não informado" na carroceria salvava sem
   * erro e, no F5, a carroceria antiga continuava lá.
   */
  it("campo opcional apagado limpa a coluna em vez de ser ignorado", () => {
    const data = vehicleUpdateSchema.parse({
      bodyType: "",
      version: "",
      color: "",
      doors: "",
      transmission: "",
      fuel: "",
      description: "",
      licensePlate: "",
    });
    expect(data).toEqual({
      bodyType: null,
      version: null,
      color: null,
      doors: null,
      transmission: null,
      fuel: null,
      description: null,
      licensePlate: null,
    });
  });

  it("troca de carroceria chega como foi escolhida", () => {
    for (const bodyType of BODY_TYPES) {
      expect(vehicleUpdateSchema.parse({ bodyType }).bodyType).toBe(bodyType);
    }
  });

  /*
   * O Zod 4 aplica .default() dentro de .partial(): um PATCH só com a
   * carroceria voltava com status "draft" e tirava o carro do ar.
   */
  it("PATCH parcial não inventa status, opcionais nem destaque", () => {
    expect(vehicleUpdateSchema.parse({ bodyType: "hatch" })).toEqual({ bodyType: "hatch" });
  });

  it("campo ausente continua ausente", () => {
    expect(vehicleUpdateSchema.parse({})).toEqual({});
  });

  it("carroceria fora da lista é recusada", () => {
    expect(vehicleUpdateSchema.safeParse({ bodyType: "Sedán" }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ bodyType: "SEDAN" }).success).toBe(false);
  });
});

describe("cadastro do veículo", () => {
  it("o que não veio ganha o padrão: rascunho, sem opcionais, sem destaque", () => {
    const data = vehicleSchema.parse({ ...base, status: undefined });
    expect(data).toMatchObject({
      status: "draft",
      options: [],
      featured: false,
      priceOnRequest: false,
    });
  });

  it("formulário vazio vira null, que o banco grava como não informado", () => {
    const data = vehicleSchema.parse({ ...base, bodyType: "", color: "", doors: "" });
    expect(data.bodyType).toBeNull();
    expect(data.color).toBeNull();
    expect(data.doors).toBeNull();
  });
});

describe("formatação dos campos", () => {
  it("placa pontuada ou minúscula é normalizada antes de validar", () => {
    expect(vehicleUpdateSchema.parse({ licensePlate: "abc-1d23" }).licensePlate).toBe("ABC1D23");
    expect(vehicleUpdateSchema.parse({ licensePlate: " ABC 1234 " }).licensePlate).toBe("ABC1234");
  });

  it("placa que não existe é recusada", () => {
    expect(vehicleUpdateSchema.safeParse({ licensePlate: "AB12345" }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ licensePlate: "ABCD123" }).success).toBe(false);
  });

  it("número que chega como texto do formulário vira número", () => {
    const data = vehicleUpdateSchema.parse({ mileageKm: "45000", yearModel: "2020", doors: "4" });
    expect(data).toEqual({ mileageKm: 45000, yearModel: 2020, doors: 4 });
  });

  it("valores absurdos são recusados", () => {
    expect(vehicleUpdateSchema.safeParse({ mileageKm: -1 }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ yearModel: 1800 }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ yearModel: new Date().getFullYear() + 5 }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ priceCents: -100 }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ doors: 9 }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ mileageKm: 12.5 }).success).toBe(false);
  });

  it("marca e modelo com só espaços são recusados", () => {
    expect(vehicleSchema.safeParse({ ...base, brand: "   " }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base, model: "" }).success).toBe(false);
  });
});

describe("segurança da entrada", () => {
  it("texto enorme é recusado antes de chegar ao banco", () => {
    expect(vehicleUpdateSchema.safeParse({ description: "a".repeat(5001) }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ brand: "a".repeat(61) }).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ options: Array(61).fill("abs") }).success).toBe(false);
  });

  it("campo que não existe no veículo não passa para o update", () => {
    const data = vehicleUpdateSchema.parse({ bodyType: "suv", tenantId: "outra-revenda", id: "x" });
    expect(data).toEqual({ bodyType: "suv" });
  });

  it("status fora da lista é recusado", () => {
    expect(vehicleUpdateSchema.safeParse({ status: "publicado" }).success).toBe(false);
  });
});
