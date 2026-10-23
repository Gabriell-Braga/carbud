import { describe, expect, it } from "vitest";
import { advanceDueDate, isKnownEvent, mapAsaasEvent, outcomeForPayment } from "./event-map";

describe("tradução de evento do Asaas", () => {
  it("pagamento confirmado deixa adimplente e registra recebimento", () => {
    const outcome = mapAsaasEvent("PAYMENT_CONFIRMED");
    expect(outcome?.billingStatus).toBe("adimplente");
    expect(outcome?.subscriptionStatus).toBe("active");
    expect(outcome?.registersPayment).toBe(true);
  });

  it("vencido marca inadimplente — quem suspende é a régua, com tolerância", () => {
    const outcome = mapAsaasEvent("PAYMENT_OVERDUE");
    expect(outcome?.billingStatus).toBe("inadimplente");
    expect(outcome?.subscriptionStatus).toBe("past_due");
    expect(outcome?.registersPayment).toBeUndefined();
  });

  it("nenhum evento devolve suspenso direto: suspensão é decisão da régua", () => {
    for (const event of ["PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"]) {
      expect(mapAsaasEvent(event)?.billingStatus).not.toBe("suspenso");
    }
  });

  it("estorno e chargeback tiram a adimplência", () => {
    expect(mapAsaasEvent("PAYMENT_REFUNDED")?.billingStatus).toBe("inadimplente");
    expect(mapAsaasEvent("PAYMENT_CHARGEBACK_REQUESTED")?.billingStatus).toBe("inadimplente");
  });

  it("informativos não mexem em acesso", () => {
    for (const event of ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_DELETED"]) {
      const outcome = mapAsaasEvent(event);
      expect(outcome?.informational).toBe(true);
      expect(outcome?.billingStatus).toBeUndefined();
    }
  });

  it("evento desconhecido não quebra nada", () => {
    expect(mapAsaasEvent("EVENTO_QUE_NAO_EXISTE")).toBeNull();
    expect(isKnownEvent("EVENTO_QUE_NAO_EXISTE")).toBe(false);
  });

  it("todo evento mapeado tem texto para o histórico", () => {
    for (const event of ["PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_CREATED"]) {
      expect(mapAsaasEvent(event)?.note).toBeTruthy();
    }
  });
});

describe("próximo vencimento", () => {
  const base = new Date(Date.UTC(2026, 0, 31));

  it("mensal avança um mês", () => {
    expect(advanceDueDate(new Date(Date.UTC(2026, 0, 10)), "MONTHLY").toISOString())
      .toContain("2026-02-10");
  });

  it("anual avança doze meses", () => {
    expect(advanceDueDate(new Date(Date.UTC(2026, 0, 10)), "YEARLY").toISOString())
      .toContain("2027-01-10");
  });

  it("ciclo desconhecido cai em mensal", () => {
    expect(advanceDueDate(new Date(Date.UTC(2026, 0, 10)), "?!").toISOString())
      .toContain("2026-02-10");
  });

  it("não perde o vencimento em mês curto", () => {
    // 31/01 + 1 mês não existe em fevereiro; precisa cair dentro de março
    const next = advanceDueDate(base, "MONTHLY");
    expect(next.getTime()).toBeGreaterThan(base.getTime());
  });
});

describe("dois eventos positivos da mesma cobrança", () => {
  it("o segundo não registra pagamento de novo nem empurra vencimento", () => {
    const received = mapAsaasEvent("PAYMENT_RECEIVED")!;
    const second = outcomeForPayment(received, true);
    expect(second.registersPayment).toBe(false);
    expect(second.billingStatus).toBe("adimplente");
    expect(outcomeForPayment(received, false)).toBe(received);
  });
});
