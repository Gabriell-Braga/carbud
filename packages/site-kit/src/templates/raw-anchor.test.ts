import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `<a>` e `<form action>` crus com destino interno perdem o mount path.
 *
 * Na prévia do painel o site vive sob `/app/r/<slug>`, e só o `<Link>` do
 * Next acrescenta o `/app`. Já quebrou três vezes (ficha → venda seu carro,
 * simulador → financiamento, barra fixa da ficha), sempre em produção e nunca
 * no dev, que roda sem mount path; a busca da home caía no mesmo buraco pelo
 * `<form action>`. Por isso a regra é verificada aqui: `<a>` cru só para fora
 * do site (nova aba, telefone, e-mail), e busca com `<Form>` do `next/form`.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

// os canais da página de contato são WhatsApp, telefone e e-mail
const EXTERNAL = /target[=:]|href=\{`(tel|mailto):|href=\{canal\.href\}/;

describe("templates", () => {
  it("não usam <a> cru para link interno", () => {
    const root = join(__dirname);
    const offenders: string[] = [];

    for (const file of tsxFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<a[\s>][\s\S]*?>/g)) {
        if (!EXTERNAL.test(match[0])) {
          offenders.push(`${relative(root, file)}: ${match[0].replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("não usam <form action> cru", () => {
    const root = join(__dirname);
    const offenders: string[] = [];

    for (const file of tsxFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<form[\s>][\s\S]*?>/g)) {
        // com onSubmit o JS assume (filter-form); a action só vale sem JS
        if (/\baction=/.test(match[0]) && !/onSubmit=/.test(match[0])) {
          offenders.push(`${relative(root, file)}: ${match[0].replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
