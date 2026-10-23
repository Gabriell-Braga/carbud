import { describe, expect, it } from "vitest";
import type { SiteData, SiteStore, VehicleView } from "../templates/contract";
import { vehiclePlace, vehicleStore } from "./maps";

const address = (full: string | null): SiteStore["address"] => ({
  street: full,
  number: null,
  complement: null,
  district: null,
  city: null,
  state: null,
  zip: null,
  full,
});

const store = (id: string, full: string | null): SiteStore => ({
  id,
  name: id,
  isDefault: false,
  phone: null,
  whatsapp: null,
  whatsappDigits: null,
  email: null,
  address: address(full),
});

const site = {
  contact: { address: address("Matriz"), mapsUrl: "https://maps.example/matriz" },
  stores: [store("centro", "Rua A"), store("sem-endereco", null)],
} as unknown as SiteData;

const vehicle = (storeId?: string | null) => ({ storeId }) as VehicleView;

describe("vehiclePlace", () => {
  it("usa o endereço da unidade do carro", () => {
    expect(vehiclePlace(site, vehicle("centro")).address.full).toBe("Rua A");
    // o link manual da matriz não pode ir junto com o endereço da unidade
    expect(vehiclePlace(site, vehicle("centro")).mapsUrl).toBeUndefined();
  });

  it("cai na loja quando o carro não tem unidade ou ela não tem endereço", () => {
    expect(vehiclePlace(site, vehicle(null)).address.full).toBe("Matriz");
    expect(vehiclePlace(site, vehicle("sem-endereco")).address.full).toBe("Matriz");
    expect(vehiclePlace(site, vehicle("outra")).address.full).toBe("Matriz");
  });

  it("aceita painel antigo, sem lista de unidades", () => {
    const old = { ...site, stores: undefined } as SiteData;
    expect(vehicleStore(old, vehicle("centro"))).toBeNull();
    expect(vehiclePlace(old, vehicle("centro")).address.full).toBe("Matriz");
  });
});
