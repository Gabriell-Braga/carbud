import { describe, expect, it } from "vitest";
import { fillBody, resolveParameter } from "./campaigns";

const base = { name: "Nathan Trabalho", vehicleLabel: null, negotiation: null, tenantName: "Dri-Car" };

describe("resolveParameter", () => {
  it("usa o primeiro nome e o carro da ficha antes do anúncio", () => {
    expect(
      resolveParameter("Oi {nome}, chegou {veiculo} na {revenda}", {
        ...base,
        vehicleLabel: "Polo 2026",
        negotiation: { brand: "Renault", model: "Kwid" },
      }),
    ).toBe("Oi Nathan, chegou Renault Kwid na Dri-Car");
  });

  it("nunca devolve vazio: a Meta recusa parâmetro em branco", () => {
    expect(resolveParameter("{veiculo}", base)).toBe("seu próximo carro");
    expect(resolveParameter("{nome}", { ...base, name: "  " })).toBe("cliente");
    expect(resolveParameter("   ", base)).toBe("-");
  });
});

describe("fillBody", () => {
  it("preenche {{n}} pela posição e deixa o que faltar", () => {
    expect(fillBody("Oi {{1}}, temos {{2}}. {{3}}", ["Ana", "Kwid"])).toBe("Oi Ana, temos Kwid. {{3}}");
  });
});
