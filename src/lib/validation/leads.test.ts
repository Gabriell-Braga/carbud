import { describe, expect, it } from "vitest";
import { publicLeadSchema } from "./leads";

const lead = { tenantSlug: "phv-motors", name: "Maria Souza", phone: "(27) 99636-1212" };

describe("lead do site", () => {
  it("aceita o que o formulário manda", () => {
    expect(publicLeadSchema.safeParse(lead).success).toBe(true);
  });

  it("telefone precisa ter DDD", () => {
    expect(publicLeadSchema.safeParse({ ...lead, phone: "99636-1212" }).success).toBe(false);
    expect(publicLeadSchema.safeParse({ ...lead, phone: "(27) 9abc-defg" }).success).toBe(false);
  });

  it("nome curto demais ou só espaços é recusado", () => {
    expect(publicLeadSchema.safeParse({ ...lead, name: "A" }).success).toBe(false);
    expect(publicLeadSchema.safeParse({ ...lead, name: "   " }).success).toBe(false);
  });

  it("e-mail é opcional, mas quando vem precisa ser válido", () => {
    expect(publicLeadSchema.safeParse({ ...lead, email: "" }).success).toBe(true);
    expect(publicLeadSchema.safeParse({ ...lead, email: "maria@" }).success).toBe(false);
  });

  it("texto gigante é recusado (endpoint público)", () => {
    expect(publicLeadSchema.safeParse({ ...lead, message: "x".repeat(2001) }).success).toBe(false);
    expect(publicLeadSchema.safeParse({ ...lead, name: "x".repeat(121) }).success).toBe(false);
  });

  it("carro que não é uuid é recusado", () => {
    expect(publicLeadSchema.safeParse({ ...lead, vehicleId: "1 OR 1=1" }).success).toBe(false);
  });

  it("tipo de formulário fora da lista é recusado", () => {
    expect(publicLeadSchema.safeParse({ ...lead, kind: "admin" }).success).toBe(false);
  });

  it("o formulário antes do WhatsApp é aceito como tipo próprio", () => {
    expect(publicLeadSchema.parse({ ...lead, kind: "whatsapp" }).kind).toBe("whatsapp");
  });
});
