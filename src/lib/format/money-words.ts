const UNITS = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** 1..999 */
function triple(n: number): string {
  if (n === 100) return "cem";
  const parts: string[] = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push(UNITS[rest % 10]);
  } else if (rest) {
    parts.push(UNITS[rest]);
  }
  return parts.join(" e ");
}

const SCALES: [string, string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

function integerInWords(n: number): string {
  if (n === 0) return "zero";
  const groups: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);

  const words: { text: string; value: number }[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (!group) continue;
    const [one, many] = SCALES[i];
    // "mil", não "um mil"
    const number = i === 1 && group === 1 ? "" : triple(group);
    const scale = i === 0 ? "" : group === 1 ? one : many;
    words.push({ text: [number, scale].filter(Boolean).join(" "), value: group });
  }
  // o "e" só antes do último grupo quando ele é < 100 ou centena redonda:
  // "mil e quinhentos", mas "mil, novecentos e dez" vira "mil novecentos e dez"
  return words
    .map((word, index) => {
      if (index === 0) return word.text;
      const last = index === words.length - 1;
      const joinWithE = last && (word.value < 100 || word.value % 100 === 0);
      return `${joinWithE ? "e " : ""}${word.text}`;
    })
    .join(" ");
}

/**
 * Valor por extenso para contrato: 5490000 → "cinquenta e quatro mil e
 * novecentos reais". Milhão redondo leva "de": "um milhão de reais".
 */
export function moneyInWords(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  const reais = Math.floor(safe / 100);
  const centavos = safe % 100;
  const parts: string[] = [];
  if (reais > 0) {
    const roundMillion = reais >= 1_000_000 && reais % 1_000_000 === 0;
    parts.push(`${integerInWords(reais)}${roundMillion ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) parts.push(`${integerInWords(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return parts.length ? parts.join(" e ") : "zero reais";
}
