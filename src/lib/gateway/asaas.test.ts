import { describe, expect, it } from "vitest";
import { toAsaasDate, toAsaasPhone, toCents, toReais } from "./asaas";

describe("conversão de valores", () => {
  it("converte centavos para reais decimais, que é o que o Asaas espera", () => {
    expect(toReais(29900)).toBe(299);
    expect(toReais(54900)).toBe(549);
    expect(toReais(99)).toBe(0.99);
    expect(toReais(0)).toBe(0);
  });

  it("volta de reais para centavos sem perder centavo", () => {
    expect(toCents(299)).toBe(29900);
    expect(toCents("549.90")).toBe(54990);
    expect(toCents(0.1)).toBe(10);
  });

  it("aguenta valor ausente vindo do webhook", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("nao-e-numero")).toBe(0);
  });

  it("ida e volta preserva o valor", () => {
    for (const cents of [29900, 54900, 99900, 1, 12345]) {
      expect(toCents(toReais(cents))).toBe(cents);
    }
  });
});

describe("formato de data", () => {
  it("usa AAAA-MM-DD", () => {
    expect(toAsaasDate(new Date(Date.UTC(2026, 8, 10, 15, 30)))).toBe("2026-09-10");
  });
});

describe("telefone", () => {
  it("tira o 55 do país, que faz o Asaas recusar o cliente", () => {
    expect(toAsaasPhone("5527996361212")).toBe("27996361212");
    expect(toAsaasPhone("+55 (27) 3322-1100")).toBe("2733221100");
    expect(toAsaasPhone("27996361212")).toBe("27996361212");
  });

  it("número incompleto não vai", () => {
    expect(toAsaasPhone("996361212")).toBeUndefined();
    expect(toAsaasPhone("")).toBeUndefined();
    expect(toAsaasPhone(null)).toBeUndefined();
  });
});
