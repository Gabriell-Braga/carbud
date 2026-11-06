/**
 * Abre cada página do painel da revenda num Chrome headless, no desktop e no
 * celular, e lista cards encostados (menos de 8px entre um e outro).
 *
 * Mede a página renderizada, não o código: card colado nasce de margem num
 * card só, e ela some quando o vizinho deixa de aparecer — o que depende do
 * plano e das permissões, e nenhuma leitura de código pega.
 *
 *   node scripts/audit-cards.mjs http://localhost:3000 <email> <senha>
 *   ONLY=/admin/usuarios,/admin/leads node scripts/audit-cards.mjs ...
 *
 * Use uma revenda no plano mais completo: card de recurso fora do plano não
 * aparece e não é medido. Precisa do Chrome instalado.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [base, email, password] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const cookies = login.headers.getSetCookie().map((raw) => {
  const [pair] = raw.split(";");
  const index = pair.indexOf("=");
  return { name: pair.slice(0, index), value: pair.slice(index + 1) };
});
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const html = async (path) => (await fetch(`${base}${path}`, { headers: { cookie: cookieHeader } })).text();
const firstId = (text, prefix) => text.match(new RegExp(`${prefix}/([0-9a-f-]{36})`))?.[1];

const leadId = firstId(await html("/admin/leads"), "/admin/leads");
const vehicleId = firstId(await html("/admin/estoque"), "/admin/estoque");
const portal = (await html("/admin/portais")).match(/\/admin\/portais\/([a-z0-9-]+)/)?.[1];

const pages = [
  "/admin", "/admin/agenda", "/admin/assinatura", "/admin/avaliacoes", "/admin/campanhas",
  "/admin/estoque", `/admin/estoque/${vehicleId}`, `/admin/estoque/${vehicleId}/venda`, "/admin/estoque/novo",
  "/admin/financeiro", "/admin/financiamentos", "/admin/funil", "/admin/leads", `/admin/leads/${leadId}`,
  `/admin/leads/${leadId}/proposta`, "/admin/portais", ...(portal ? [`/admin/portais/${portal}`] : []),
  "/admin/relatorios", "/admin/unidades", "/admin/usuarios",
  ...["modelos", "avisos", "conexao"].map((tab) => `/admin/mensagens?aba=${tab}`),
  ...["chaves", "webhooks", "feed"].map((tab) => `/admin/integracoes?aba=${tab}`),
  ...["identidade", "contato", "conteudo", "paginas", "dominio", "rastreamento"].map((tab) => `/admin/site?aba=${tab}`),
];

if (process.env.ONLY) pages.splice(0, pages.length, ...process.env.ONLY.split(","));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run", "--disable-gpu",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "audit-"))}`, "about:blank",
], { stdio: "ignore" });

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  wsUrl = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).then((j) => j.webSocketDebuggerUrl).catch(() => null);
}

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else for (const listener of listeners) listener(msg);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
const s = (method, params) => send(method, params, sessionId);
await s("Page.enable");
await s("Network.enable");
const host = new URL(base).hostname;
for (const cookie of cookies) await s("Network.setCookie", { ...cookie, domain: host, path: "/" });

const AUDIT = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const cards = [...document.querySelectorAll('.rounded-card')].filter(visible);
  const name = (el) => (el.querySelector('h2,h3,[class*=label]')?.textContent || el.textContent || '').trim().slice(0, 40);
  const out = [];
  for (const a of cards) for (const b of cards) {
    if (a === b || a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const hOverlap = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const vOverlap = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    const gapV = rb.top - ra.bottom, gapH = rb.left - ra.right;
    if (hOverlap > 20 && gapV >= -1 && gapV < 8) out.push('vertical ' + Math.round(gapV) + 'px: [' + name(a) + '] / [' + name(b) + ']');
    if (vOverlap > 20 && gapH >= -1 && gapH < 8) out.push('lado a lado ' + Math.round(gapH) + 'px: [' + name(a) + '] / [' + name(b) + ']');
  }
  return [...new Set(out)];
})()`;

const waitLoad = () => new Promise((resolve) => {
  const listener = (msg) => {
    if (msg.method === "Page.loadEventFired" && msg.sessionId === sessionId) {
      listeners.splice(listeners.indexOf(listener), 1);
      resolve();
    }
  };
  listeners.push(listener);
});

let problems = 0;
for (const [label, width, height, mobile] of [["desktop", 1440, 900, false], ["celular", 390, 844, true]]) {
  await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  for (const path of pages) {
    const loaded = waitLoad();
    await s("Page.navigate", { url: `${base}${path}` });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 90_000))]);
    await new Promise((r) => setTimeout(r, 1500));
    const { result } = await s("Runtime.evaluate", { expression: AUDIT, returnByValue: true });
    const found = result?.result?.value ?? [JSON.stringify(result).slice(0, 300)];
    for (const item of found) {
      problems += 1;
      console.log(`${label} ${path} :: ${item}`);
    }
  }
}
console.log(`fim: ${problems} ocorrência(s) em ${pages.length} páginas x 2 larguras`);
ws.close();
chrome.kill();
process.exit(problems > 0 ? 1 : 0);
