import { describe, expect, it } from "vitest";
import { generateCode, normalizeEmail } from "./buyers";

describe("código do comprador", () => {
  it("tem sempre seis dígitos, inclusive com zero à esquerda", () => {
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("normaliza o e-mail para o mesmo comprador não virar dois", () => {
    expect(normalizeEmail("  Camila@Email.COM ")).toBe("camila@email.com");
  });
});
