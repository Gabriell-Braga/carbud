import { describe, expect, it } from "vitest";
import { formatWait, median, responseTimes } from "./attendance";

const min = 60_000;

describe("responseTimes", () => {
  it("conta da primeira mensagem do cliente até a nossa, juntando as seguidas", () => {
    const result = responseTimes([
      { leadId: "a", direction: "in", at: 0 },
      { leadId: "a", direction: "in", at: 5 * min },
      { leadId: "a", direction: "out", at: 20 * min },
      { leadId: "a", direction: "out", at: 21 * min },
      { leadId: "a", direction: "in", at: 30 * min },
      { leadId: "a", direction: "out", at: 32 * min },
    ]);
    expect(result).toEqual({ minutes: [20, 2], waiting: 0 });
  });

  it("separa por lead e conta quem ficou sem resposta", () => {
    const result = responseTimes([
      { leadId: "b", direction: "out", at: 0 },
      { leadId: "c", direction: "in", at: 10 * min },
    ]);
    expect(result).toEqual({ minutes: [], waiting: 1 });
  });
});

describe("median", () => {
  it("par e ímpar", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("formatWait", () => {
  it("escolhe a unidade", () => {
    expect(formatWait(0.5)).toBe("menos de 1 min");
    expect(formatWait(45)).toBe("45 min");
    expect(formatWait(130)).toBe("2 h 10 min");
    expect(formatWait(60 * 24 * 3)).toBe("3 dia(s)");
  });
});
