#!/usr/bin/env node
/**
 * Varre o site da revenda demo em produção e lista todo link que não dá 200.
 *
 * Existe porque os erros de mount path (`/app`) nunca aparecem no dev, que
 * roda sem ele: só a produção mostra. Rode depois de cada deploy.
 *
 *   node scripts/smoke-prod.mjs [base] [slug]
 *   node scripts/smoke-prod.mjs https://crm.carbud.com.br/app demo
 *
 * Segue os links das páginas, do sitemap e dos feeds, mas não sai do domínio:
 * WhatsApp, redes sociais e mapas ficam de fora.
 */

const base = (process.argv[2] ?? "https://crm.carbud.com.br/app").replace(/\/+$/, "");
const slug = process.argv[3] ?? "demo";
const origin = new URL(base).origin;
const site = `${base}/r/${slug}`;

const pages = ["", "/estoque", "/contato", "/sobre", "/financiamento", "/venda-seu-carro"];
const documents = ["/robots.txt", "/sitemap.xml", "/estoque.xml", "/estoque.json", "/catalogo-meta.xml"];

async function get(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return { status: 0, body: String(error) };
  }
}

/** href, src, <loc>, <url>, <foto> e URLs soltas no JSON. */
function extract(body) {
  const found = [
    ...body.matchAll(/(?:href|src)="([^"#]+)"/g),
    ...body.matchAll(/<(?:loc|url|foto)>([^<]+)</g),
    ...body.matchAll(/"(https?:\/\/[^"]+)"/g),
  ].map((match) => match[1].replace(/&amp;/g, "&"));

  return found
    .map((value) => (value.startsWith("/") && !value.startsWith("//") ? origin + value : value))
    .filter((value) => value.startsWith(origin));
}

const targets = new Set(documents.map((path) => site + path));

// a primeira ficha de veículo entra na varredura: é onde mora a maior parte dos links
for (const path of pages) {
  const url = site + path;
  targets.add(url);
  const { body } = await get(url);
  for (const link of extract(body)) targets.add(link);
}
const vehicle = [...targets].find((url) => url.includes(`/r/${slug}/veiculo/`));
if (vehicle) for (const link of extract((await get(vehicle)).body)) targets.add(link);

for (const path of documents) {
  for (const link of extract((await get(site + path)).body)) targets.add(link);
}

let failures = 0;
for (const url of [...targets].sort()) {
  const { status } = await get(url);
  // redirect do Next para a barra final ou para /indisponivel não é erro
  if (status !== 200 && !(status >= 300 && status < 400)) {
    failures++;
    console.log(`${status} ${url}`);
  }
}

console.log(`${targets.size} URLs, ${failures} com problema`);
process.exit(failures > 0 ? 1 : 0);
