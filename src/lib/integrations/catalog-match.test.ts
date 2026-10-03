import { describe, expect, it } from "vitest";
import {
  matchBrand,
  matchModel,
  matchVersion,
  noMatchMessage,
  versionScore,
} from "./catalog-match";

const entries = (...names: string[]) =>
  names.map((name, index) => ({ id: String(index + 1), name }));

describe("matchBrand", () => {
  it("casa as grafias que os portais usam para a mesma marca", () => {
    const catalog = entries("AUDI", "VW - VOLKSWAGEN", "GM - CHEVROLET", "MERCEDES-BENZ");
    expect(matchBrand("Volkswagen", catalog)).toMatchObject({ ok: true, entry: { id: "2" } });
    expect(matchBrand("Chevrolet", catalog)).toMatchObject({ ok: true, entry: { id: "3" } });
    expect(matchBrand("Mercedes-Benz", catalog)).toMatchObject({ ok: true, entry: { id: "4" } });
  });

  it("não inventa marca que não existe", () => {
    expect(matchBrand("Fiat", entries("AUDI", "BMW")).ok).toBe(false);
  });
});

describe("matchModel", () => {
  it("aceita prefixo só quando há um candidato", () => {
    expect(matchModel("Hilux", entries("HILUX CD", "COROLLA"))).toMatchObject({
      ok: true,
      entry: { id: "1" },
    });
    expect(matchModel("Onix", entries("ONIX HATCH", "ONIX PLUS")).ok).toBe(false);
  });
});

describe("matchVersion", () => {
  it("casa a versão da FIPE com a do portal, apesar da grafia", () => {
    const catalog = entries(
      "1.0 MPI TOTALFLEX 4P MANUAL",
      "1.6 MSI TOTALFLEX 4P MANUAL",
      "1.0 TSI TOTALFLEX 4P AUTOMÁTICO",
    );
    expect(matchVersion("1.0 MPI Total Flex 4p Manual", catalog)).toMatchObject({
      ok: true,
      entry: { id: "1" },
    });
  });

  it("cilindrada diferente nunca é a mesma versão", () => {
    expect(versionScore("1.0 MPI Flex Manual", "1.6 MPI Flex Manual")).toBe(0);
  });

  it("empate não escolhe: devolve as parecidas para a loja decidir", () => {
    const result = matchVersion(
      "1.0 Flex",
      entries("1.0 FLEX 4P MANUAL", "1.0 FLEX 4P AUTOMATICO"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.suggestions).toHaveLength(2);
  });

  it("versão vazia é recusa, não chute", () => {
    expect(matchVersion(null, entries("A")).ok).toBe(false);
  });
});

describe("noMatchMessage", () => {
  it("diz o que o portal tem de mais parecido", () => {
    expect(noMatchMessage("A OLX", "versão", "1.0 X", ["1.0 Y", "1.0 Z"])).toBe(
      'A OLX não tem a versão "1.0 X" no catálogo dele. Mais parecidas lá: 1.0 Y; 1.0 Z. Ajuste a ficha para uma delas.',
    );
  });
});
