import { describe, expect, it } from "vitest";
import { moneyInWords } from "./money-words";

describe("moneyInWords", () => {
  it.each([
    [5_490_000, "cinquenta e quatro mil e novecentos reais"],
    [2_800_000, "vinte e oito mil reais"],
    [2_690_000, "vinte e seis mil e novecentos reais"],
    [700_000, "sete mil reais"],
    [94_834, "novecentos e quarenta e oito reais e trinta e quatro centavos"],
    [100, "um real"],
    [10_000, "cem reais"],
    [10_100, "cento e um reais"],
    [150_000, "mil e quinhentos reais"],
    [191_000, "mil novecentos e dez reais"],
    [123_456_700, "um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete reais"],
    [100_000_000, "um milhão de reais"],
    [5, "cinco centavos"],
    [0, "zero reais"],
  ])("%i", (cents, words) => {
    expect(moneyInWords(cents)).toBe(words);
  });
});
