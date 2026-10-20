import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePatch } from "./patch";
import { bannerSchema } from "./site";

describe("parsePatch", () => {
  it("default não reescreve o que não veio no PATCH", () => {
    const schema = z.object({ title: z.string(), active: z.boolean().default(true) });
    const result = parsePatch(schema, { title: "Novo" });
    expect(result.success && result.data).toEqual({ title: "Novo" });
  });

  it("banner: editar o título não reativa nem reposiciona", () => {
    const result = parsePatch(bannerSchema, { title: "Ofertas" });
    expect(result.success && result.data).toEqual({ title: "Ofertas" });
  });

  it("banner: apagar o título limpa", () => {
    const result = parsePatch(bannerSchema, { title: "" });
    expect(result.success && result.data).toEqual({ title: null });
  });

  it("valor inválido continua recusado", () => {
    expect(parsePatch(bannerSchema, { position: -1 }).success).toBe(false);
  });

  it("corpo que não é objeto vira PATCH vazio", () => {
    const result = parsePatch(bannerSchema, null);
    expect(result.success).toBe(false);
  });
});
