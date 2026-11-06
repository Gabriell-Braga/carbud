import { describe, expect, it } from "vitest";
import { agendaBucket, endOfBrazilDay } from "./lead-tasks";

describe("agendaBucket", () => {
  // 21h30 em Brasília = 00h30 UTC do dia seguinte: é aqui que UTC erra o "hoje"
  const now = new Date("2026-11-07T00:30:00Z");

  it("passou da hora é atrasada", () => {
    expect(agendaBucket(new Date("2026-11-07T00:00:00Z"), now)).toBe("overdue");
  });

  it("22h de Brasília ainda é hoje, mesmo já sendo amanhã em UTC", () => {
    expect(agendaBucket(new Date("2026-11-07T01:00:00Z"), now)).toBe("today");
  });

  it("depois da meia-noite de Brasília é próxima", () => {
    expect(agendaBucket(new Date("2026-11-07T03:30:00Z"), now)).toBe("upcoming");
  });
});

describe("endOfBrazilDay", () => {
  it("fecha às 23h59 de Brasília", () => {
    expect(endOfBrazilDay(new Date("2026-11-07T00:30:00Z")).toISOString()).toBe(
      "2026-11-07T02:59:59.999Z",
    );
  });
});
