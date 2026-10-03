/**
 * Casar marca, modelo e versão do nosso cadastro com o catálogo do portal.
 *
 * OLX e Webmotors não aceitam texto livre: cada um tem a própria tabela de
 * marcas, modelos e versões, com ids próprios, e recusa o anúncio inteiro
 * quando o id não bate com o resto. O nosso cadastro guarda nomes (vindos da
 * FIPE ou digitados), então a ponte é por nome — e nome de versão nunca vem
 * escrito igual nos dois lados: "1.0 MPI Total Flex Manual" aqui,
 * "1.0 MPI TOTALFLEX 4P MANUAL" lá.
 *
 * A regra é conservadora de propósito. Na dúvida entre duas versões, não
 * escolhemos: devolvemos as mais parecidas para a loja ajustar a ficha.
 * Publicar o carro na versão errada é pior que não publicar — o portal
 * mostra outro preço FIPE, outros opcionais, e quem liga reclama.
 */

export type CatalogEntry = { id: string; name: string };

export type CatalogMatch = { ok: true; entry: CatalogEntry } | { ok: false; suggestions: string[] };

/** Sem acento, minúsculo, pontuação vira espaço, espaços colapsados. */
export function normalizeCatalogName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Grafias que mudam de portal para portal e significam a mesma coisa. */
const TOKEN_ALIASES: Record<string, string> = {
  totalflex: "flex",
  "total-flex": "flex",
  tflex: "flex",
  aut: "automatico",
  automatica: "automatico",
  automatic: "automatico",
  at: "automatico",
  mec: "manual",
  mt: "manual",
  p: "portas",
  sedan: "seda",
  "4p": "4portas",
  "2p": "2portas",
  "3p": "3portas",
  "5p": "5portas",
};

function tokens(value: string): string[] {
  const normalized = normalizeCatalogName(value)
    // "total flex" é uma palavra só no catálogo de quase todo portal
    .replace(/\btotal flex\b/g, "flex")
    .replace(/\b(\d) portas\b/g, "$1p");
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? token);
}

/** Marcas que os portais escrevem diferente da FIPE. */
const BRAND_ALIASES: Record<string, string[]> = {
  volkswagen: ["vw volkswagen", "vw", "volks"],
  chevrolet: ["gm chevrolet", "gm"],
  "mercedes benz": ["mercedes", "mercedes benz", "m.benz", "mercedes-benz"],
  citroen: ["citroen"],
  "land rover": ["landrover"],
  "caoa chery": ["chery", "caoa chery"],
  jac: ["jac motors"],
  ram: ["dodge ram"],
};

function canonicalBrand(value: string): string {
  const normalized = normalizeCatalogName(value);
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    if (normalized === canonical || aliases.includes(normalized)) return canonical;
  }
  return normalized;
}

/**
 * Marca e modelo: igualdade depois de normalizar. Para modelo, aceita também
 * o caso em que um lado tem só a primeira palavra ("Onix" x "Onix Plus" não;
 * "Hilux" x "Hilux CD" sim, se for o único candidato).
 */
export function matchBrand(name: string, catalog: CatalogEntry[]): CatalogMatch {
  const wanted = canonicalBrand(name);
  const hit = catalog.find((entry) => canonicalBrand(entry.name) === wanted);
  if (hit) return { ok: true, entry: hit };
  return { ok: false, suggestions: closest(name, catalog) };
}

export function matchModel(name: string, catalog: CatalogEntry[]): CatalogMatch {
  const wanted = normalizeCatalogName(name);
  const exact = catalog.find((entry) => normalizeCatalogName(entry.name) === wanted);
  if (exact) return { ok: true, entry: exact };

  // "Hilux" aqui, "Hilux CD" lá (ou o contrário): vale quando é um só
  const prefixed = catalog.filter((entry) => {
    const other = normalizeCatalogName(entry.name);
    return other.startsWith(`${wanted} `) || wanted.startsWith(`${other} `);
  });
  if (prefixed.length === 1) return { ok: true, entry: prefixed[0] };
  return { ok: false, suggestions: closest(name, prefixed.length ? prefixed : catalog) };
}

/**
 * Parecença entre duas versões: quanto das palavras de cada lado o outro tem.
 *
 * A cilindrada ("1.0", "2.0") pesa como veto: versões de motor diferente não
 * são a mesma versão, por mais palavras que dividam.
 */
export function versionScore(ours: string, theirs: string): number {
  const a = tokens(ours);
  const b = tokens(theirs);
  if (a.length === 0 || b.length === 0) return 0;

  const engineA = a.find((token) => /^\d\.\d$/.test(token));
  const engineB = b.find((token) => /^\d\.\d$/.test(token));
  if (engineA && engineB && engineA !== engineB) return 0;

  const setB = new Set(b);
  const setA = new Set(a);
  const shared = [...setA].filter((token) => setB.has(token)).length;
  // média das duas coberturas: versão curta aqui não perde para versão longa lá
  return (shared / setA.size + shared / setB.size) / 2;
}

/** Abaixo disso, "parecido" é coincidência de palavra solta. */
const MIN_SCORE = 0.5;
/** Dois candidatos tão perto assim um do outro: não dá para escolher. */
const TIE_MARGIN = 0.08;

export function matchVersion(name: string | null, catalog: CatalogEntry[]): CatalogMatch {
  if (!name?.trim()) {
    return { ok: false, suggestions: catalog.slice(0, 5).map((entry) => entry.name) };
  }
  const wanted = normalizeCatalogName(name);
  const exact = catalog.find((entry) => normalizeCatalogName(entry.name) === wanted);
  if (exact) return { ok: true, entry: exact };

  const ranked = catalog
    .map((entry) => ({ entry, score: versionScore(name, entry.name) }))
    .sort((x, y) => y.score - x.score);

  const [best, second] = ranked;
  if (best && best.score >= MIN_SCORE && (!second || best.score - second.score >= TIE_MARGIN)) {
    return { ok: true, entry: best.entry };
  }
  return {
    ok: false,
    suggestions: ranked.slice(0, 5).map((item) => item.entry.name),
  };
}

function closest(name: string, catalog: CatalogEntry[]): string[] {
  return catalog
    .map((entry) => ({ entry, score: versionScore(name, entry.name) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 5)
    .filter((item) => item.score > 0)
    .map((item) => item.entry.name);
}

/**
 * Frase de erro para quando não casou. Lista o que o portal tem de mais
 * parecido: é o que a loja precisa para corrigir a ficha sem abrir o portal.
 */
export function noMatchMessage(
  portalName: string,
  what: "marca" | "modelo" | "versão",
  value: string | null,
  suggestions: string[],
): string {
  const head = value
    ? `${portalName} não tem a ${what} "${value}" no catálogo dele.`
    : `${portalName} exige a ${what}, e a ficha está sem.`;
  const tail = suggestions.length
    ? ` Mais parecidas lá: ${suggestions.join("; ")}. Ajuste a ficha para uma delas.`
    : "";
  return head + tail;
}
