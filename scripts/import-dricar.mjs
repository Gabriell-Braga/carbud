#!/usr/bin/env node
/*
 * Traz o estoque da Dri-Car (API de migração do sistema antigo) para a revenda
 * no Carbud, e junto o financeiro de cada carro: compra, origem, custos e venda.
 *
 * Pode rodar de novo quantas vezes quiser: carro que já existe no Carbud (mesma
 * placa, ou mesma marca/modelo/ano/km) não é duplicado, só tem o financeiro
 * completado e, se a Dri-Car marcou como vendido, vira vendido aqui. O que já
 * foi enviado fica em `.dricar-import-state.json`, para os custos não entrarem
 * duas vezes.
 *
 * Também traz os custos fixos da loja (aluguel, salário, contas). A Dri-Car
 * espelhava cada custo de carro nessa mesma lista ("Despesa Placa: ..."); esses
 * ficam de fora, porque já entram como custo do próprio carro.
 *
 * Uso (sem --apply só mostra o que faria):
 *   DRICAR_API_KEY=... CARBUD_SESSION=<cookie pa_session> node scripts/import-dricar.mjs
 *   ... node scripts/import-dricar.mjs --apply [--limit 5] [--no-photos]
 *
 * CARBUD_SESSION é o valor do cookie `pa_session` de alguém DENTRO da revenda
 * Dri Car (admin da revenda, ou o super-admin depois de "Entrar como").
 * Opcionais: CARBUD_URL (padrão https://crm.carbud.com.br/app) e DRICAR_API_URL.
 */
import fs from "node:fs";
import sharp from "sharp";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PHOTOS = !args.includes("--no-photos");
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const DRICAR_URL = process.env.DRICAR_API_URL ?? "https://dri-car.com/api/migration";
const DRICAR_KEY = process.env.DRICAR_API_KEY;
const CARBUD_URL = (process.env.CARBUD_URL ?? "https://crm.carbud.com.br/app").replace(/\/$/, "");
const SESSION = process.env.CARBUD_SESSION;
const STATE_FILE = ".dricar-import-state.json";

if (!DRICAR_KEY || !SESSION) {
  console.error("Defina DRICAR_API_KEY e CARBUD_SESSION (veja o topo do script).");
  process.exit(1);
}

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

/* ------------------------------------------------------------------ */
/* Conversões do formato da Dri-Car                                    */
/* ------------------------------------------------------------------ */

const money = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Math.round(value * 100);
  const text = String(value).replace(/[^\d,.-]/g, "");
  // "44.599" e "44.599,90" (texto do site) x "44599.9" (Decimal do Prisma)
  const normalized = /,\d{1,2}$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(text)
      ? text.replace(/\./g, "")
      : text;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
};

const day = (value) => (value ? String(value).slice(0, 10) : null);
const plate = (value) => (value ? String(value).toUpperCase().replace(/[^A-Z0-9]/g, "") : null);
const validPlate = (value) => Boolean(value && /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(value));

function years(text, fallbackFab, fallbackMod) {
  const found = String(text ?? "").match(/(\d{4})\D+(\d{4})/) ?? String(text ?? "").match(/(\d{4})/);
  const fab = Number(found?.[1] ?? fallbackFab) || new Date().getFullYear();
  const mod = Number(found?.[2] ?? fallbackMod ?? fab) || fab;
  return { yearManufacture: fab, yearModel: mod };
}

const transmission = (text) => {
  const value = String(text ?? "").toLowerCase();
  if (value.includes("cvt")) return "cvt";
  if (value.includes("automatizad")) return "automatizado";
  if (value.includes("autom")) return "automatico";
  if (value.includes("manual")) return "manual";
  return null;
};

const bodyType = (text) => {
  const value = String(text ?? "").toLowerCase();
  if (value.includes("hatch")) return "hatch";
  if (value.includes("sed")) return "sedan";
  if (value.includes("suv")) return "suv";
  if (value.includes("picape") || value.includes("pick")) return "picape";
  if (value.includes("minivan")) return "minivan";
  if (value.includes("util")) return "utilitario";
  return null;
};

// opcionais da Dri-Car (texto livre) -> chaves do catálogo do Carbud
const OPTION_WORDS = [
  ["ar-digital", /ar.{0,15}digital/],
  ["ar-condicionado", /ar.?condicionado/],
  ["direcao-hidraulica", /dire[cç][aã]o hidr/],
  ["direcao-eletrica", /dire[cç][aã]o el[eé]t/],
  ["vidros-eletricos", /vidros? el[eé]t/],
  ["travas-eletricas", /trava/],
  ["banco-couro", /couro/],
  ["teto-solar", /teto solar/],
  ["piloto-automatico", /piloto autom/],
  ["abs", /abs/],
  ["airbag", /air.?bag/],
  ["controle-tracao", /tra[cç][aã]o/],
  ["controle-estabilidade", /estabilidade/],
  ["sensor-re", /sensor de r[eé]|sensor de estacionamento/],
  ["camera-re", /c[aâ]mera de r[eé]/],
  ["alarme", /alarme/],
  ["multimidia", /multim[ií]dia|central/],
  ["carplay", /carplay|android auto/],
  ["computador-bordo", /computador de bordo/],
  ["rodas-liga", /liga leve/],
  ["farol-neblina", /neblina/],
];
const options = (text) => {
  const value = String(text ?? "").toLowerCase();
  return OPTION_WORDS.filter(([, regex]) => regex.test(value)).map(([key]) => key);
};

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function dricarRaw(type) {
  const response = await fetch(`${DRICAR_URL}?type=${type}&include_relations=true`, {
    headers: { "x-api-key": DRICAR_KEY },
  });
  if (!response.ok) throw new Error(`Dri-Car ${type}: HTTP ${response.status}`);
  return response.json();
}

const dricar = async (type) => (await dricarRaw(type)).data ?? [];

async function carbud(method, path, body) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${CARBUD_URL}${path}`, {
    method,
    headers: {
      cookie: `pa_session=${SESSION}`,
      ...(body && !isForm ? { "content-type": "application/json" } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  return json.data ?? json;
}

async function uploadPhoto(vehicleId, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`foto ${url}: HTTP ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(source).metadata();
  const form = new FormData();
  const sizes = { thumb: [400, 75], card: [800, 82], full: [1600, 85] };
  let fullSize = 0;
  for (const [name, [width, quality]] of Object.entries(sizes)) {
    const buffer = await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (name === "full") fullSize = buffer.length;
    form.append(name, new Blob([buffer], { type: "image/webp" }), `${name}.webp`);
  }
  form.append("width", String(meta.width ?? 0));
  form.append("height", String(meta.height ?? 0));
  form.append("sizeBytes", String(fullSize));
  await carbud("POST", `/api/admin/vehicles/${vehicleId}/photos`, form);
}

/* ------------------------------------------------------------------ */

const fingerprint = (v) =>
  [v.brand, v.model, v.yearManufacture, v.yearModel, v.mileageKm]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");

async function main() {
  console.log(APPLY ? "Modo: GRAVANDO no Carbud" : "Modo: simulação (use --apply para gravar)");

  const [cars, veiculos, vendas] = await Promise.all([dricar("cars"), dricar("veiculos"), dricar("vendas")]);
  const veiculoById = new Map(veiculos.map((v) => [v.id, v]));
  const vendaByVeiculo = new Map();
  for (const venda of vendas) if (!vendaByVeiculo.has(venda.veiculoId)) vendaByVeiculo.set(venda.veiculoId, venda);

  const existing = (await carbud("GET", "/api/admin/vehicles")).vehicles;
  const byPlate = new Map(existing.filter((v) => v.licensePlate).map((v) => [v.licensePlate, v]));
  const byPrint = new Map(existing.map((v) => [fingerprint(v), v]));
  console.log(`Dri-Car: ${cars.length} no catálogo, ${veiculos.length} no ERP. Carbud: ${existing.length} veículos.`);

  // o carro do site é o que vira anúncio; vendido que nunca passou pelo Carbud fica de fora
  const candidates = cars.filter((car) => car.status !== "sold" || state[car.id]);
  const stats = { created: 0, matched: 0, sold: 0, finance: 0, expenses: 0, photos: 0, errors: 0 };
  let processed = 0;

  for (const car of candidates) {
    if (processed >= LIMIT) break;
    const veiculo = car.veiculo ?? (car.veiculoId ? veiculoById.get(car.veiculoId) : null);
    const venda = veiculo ? vendaByVeiculo.get(veiculo.id) : null;
    const y = years(car.year, veiculo?.anoFab, veiculo?.anoMod);
    const licensePlate = plate(veiculo?.placa);
    const draft = {
      brand: car.brand?.trim() || veiculo?.marca || "Sem marca",
      model: car.model?.trim() || veiculo?.modelo || "Sem modelo",
      version: car.description?.trim() || null,
      ...y,
      mileageKm: Number(String(car.mileage ?? "").replace(/\D/g, "")) || 0,
      priceCents: money(car.isOffer && car.promoPrice ? car.promoPrice : car.price) ?? 0,
      transmission: transmission(car.transmission),
      bodyType: bodyType(car.category),
      licensePlate: validPlate(licensePlate) ? licensePlate : null,
      options: options(car.accessories),
      featured: Boolean(car.isOffer),
    };
    const images = (car.images ?? []).filter(Boolean);
    const label = `${draft.brand} ${draft.model} ${draft.yearManufacture}/${draft.yearModel}`;

    try {
      const match =
        (state[car.id] && existing.find((v) => v.id === state[car.id].vehicleId)) ||
        (draft.licensePlate && byPlate.get(draft.licensePlate)) ||
        byPrint.get(fingerprint(draft));

      let vehicleId = match?.id;
      const wantSold = car.status === "sold";

      if (!match) {
        if (wantSold) continue;
        processed += 1;
        // sem foto não vai ao ar: o site mostraria um card vazio
        const status = images.length > 0 && PHOTOS ? "available" : "draft";
        console.log(`+ criar ${label} (${images.length} fotos, ${status})`);
        if (APPLY) {
          const created = await carbud("POST", "/api/admin/vehicles", { ...draft, status: "draft" });
          vehicleId = created.id;
          state[car.id] = { vehicleId };
          saveState();
          if (PHOTOS) {
            for (const url of images.slice(0, 30)) {
              try {
                await uploadPhoto(vehicleId, url);
                stats.photos += 1;
              } catch (error) {
                console.warn(`  foto falhou: ${error.message}`);
              }
            }
          }
          if (status === "available") await carbud("PATCH", `/api/admin/vehicles/${vehicleId}`, { status });
        }
        stats.created += 1;
      } else {
        processed += 1;
        stats.matched += 1;
        state[car.id] = { ...state[car.id], vehicleId };
        if (wantSold && match.status !== "sold") {
          console.log(`~ vender ${label}`);
          if (APPLY) await carbud("PATCH", `/api/admin/vehicles/${vehicleId}`, { status: "sold" });
          stats.sold += 1;
        }
      }

      if (veiculo && vehicleId) {
        const finance = {
          purchasePriceCents: money(veiculo.valorCompra),
          purchaseDate: day(veiculo.dataEntrada),
          purchaseSource: veiculo.ondeFoiComprado?.trim() || null,
          ...(venda
            ? {
                salePriceCents: money(venda.valorVendaVeiculo),
                saleDate: day(venda.dataVenda),
                bankReturnCents: money(venda.valorRetornoBancario),
                buyerName: venda.cliente?.nome?.trim() || null,
                buyerDocument: venda.cliente?.cpfCnpj?.trim() || null,
                buyerPhone: venda.cliente?.telefone?.trim() || null,
              }
            : {}),
        };
        if (APPLY) await carbud("PUT", `/api/admin/vehicles/${vehicleId}/finance`, finance);
        stats.finance += 1;

        // custo entra uma vez só: a marca no estado é o que segura a repetição
        if (!state[car.id]?.expenses) {
          for (const despesa of veiculo.despesas ?? []) {
            const amountCents = money(despesa.valor);
            if (!amountCents) continue;
            if (APPLY) {
              await carbud("POST", `/api/admin/vehicles/${vehicleId}/finance`, {
                category: despesa.categoria || "Outros",
                description: despesa.descricao || null,
                amountCents,
                date: day(despesa.dataDespesa) ?? new Date().toISOString().slice(0, 10),
              });
            }
            stats.expenses += 1;
          }
          if (APPLY) {
            state[car.id] = { ...state[car.id], expenses: true };
            saveState();
          }
        }
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`! ${label}: ${error.message}`);
    }
  }

  await importStoreExpenses(stats);

  if (APPLY) saveState();
  console.log("\nResumo:", stats);
}

async function importStoreExpenses(stats) {
  const [{ custos_fixos: fixos = [] }, despesas] = await Promise.all([
    dricarRaw("financeiro"),
    dricar("despesas"),
  ]);
  const ofVehicle = new Set(despesas.map((d) => d.custoFixoId).filter(Boolean));
  state.storeExpenses ??= {};
  stats.storeExpenses = 0;

  for (const custo of fixos) {
    if (state.storeExpenses[custo.id] || ofVehicle.has(custo.id)) continue;
    if (String(custo.descricao ?? "").startsWith("Despesa Placa:")) continue;
    const amountCents = money(custo.valor);
    const date = day(custo.dataVencimento);
    if (!amountCents || !date) continue;
    const pending = custo.statusPagamento && custo.statusPagamento !== "Pago";
    const description = [custo.descricao?.trim(), pending ? `(${custo.statusPagamento})` : null]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
    try {
      if (APPLY) {
        await carbud("POST", "/api/admin/finance/expenses", {
          category: custo.categoria?.trim() || "Outros",
          description: description || null,
          amountCents,
          date,
        });
        state.storeExpenses[custo.id] = true;
        saveState();
      }
      stats.storeExpenses += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`! custo fixo ${custo.descricao}: ${error.message}`);
    }
  }
  console.log(`Custos fixos da loja: ${stats.storeExpenses} novos de ${fixos.length} na Dri-Car.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
