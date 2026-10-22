# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Carbud: SaaS multi-tenant para revendas de veículos no Brasil. Interface e documentação em pt-BR; código e identificadores em inglês. Antes de mexer em algo grande, leia [docs/ESTADO.md](docs/ESTADO.md) (estado, decisões e pendências) e o [README.md](README.md).

## Comandos

```bash
npm run dev            # painel (Next puro), porta 3000 — rápido para UI
npm run preview        # build OpenNext + wrangler dev em 127.0.0.1:8787, runtime real do Workers (D1/KV/R2 locais em .wrangler/)
npm run dev:sites      # app dos sites, porta 3100 (precisa do painel de pé; use FALLBACK_TENANT_SLUG)

npm run check          # typecheck (raiz + sites) + lint + testes — rode antes de commitar
npm run test           # vitest run
npx vitest run src/lib/auth/rbac.test.ts   # um arquivo
npx vitest run -t "nome do teste"          # um teste pelo nome

npm run build          # bundle das migrations + next build (CI usa BASE_URL=/app)
npm run build:sites    # exige PANEL_URL

npm run db:generate    # migration a partir do schema Drizzle
npm run db:bundle      # regenera src/db/migrations.generated.ts — commitar junto com a migration (CI confere)
node scripts/smoke-prod.mjs   # depois do deploy: todo link da demo em produção que não dá 200
```

Primeira execução local: copie `.dev.vars.example` para `.dev.vars`, depois `POST /api/ops/migrate` e `POST /api/ops/bootstrap` com header `x-ops-secret` (ver README).

Windows: derrube o `npm run dev` antes de `npm run build` (EPERM em `.next/trace`) e apague `.next` depois do build antes de voltar ao dev (senão o dev responde 500).

## Arquitetura

Três camadas, num workspace npm:

- `src/` — **painel** (Next.js 15 App Router → OpenNext → Cloudflare Workers, deploy no Webflow Cloud por push na `main`). Único dono do banco. Contém `/super-admin`, `/admin` (revenda), prévia do site público em `/r/[slug]`, e as rotas `/api/*`.
- `sites/` — **app dos sites** na Vercel (um projeto, muitos domínios; descobre a revenda pelo `Host`). **Não tem banco**: tudo vem de `src/app/api/public/*`. Import de Drizzle em `sites/` é erro de desenho.
- **Portal Carbud** (repositório separado, `portal-carbud`, outra conta da Vercel): marketplace com o estoque de todas as revendas no ar. Também sem banco: lê `src/app/api/public/portal/*` (busca cross-revenda e lojas, com a mesma regra `isPublicSiteAvailable` do site) e reaproveita `/api/public/site/[slug]/*` e `/api/leads`. Mudar o contrato dessas rotas quebra os dois apps.
- `packages/site-kit/` (`@carbud/site-kit`) — templates (`vitrine`, `showroom`, `marketplace`) e utilitários compartilhados pelos dois apps. Existe porque a Vercel com Root Directory em `sites/` não importa `..`. Não pode saber que existe painel (nada de banco, auth, cobrança). A entrada `catalog` é separada porque o schema do banco importa dela e a entrada principal traria React para o Worker.

### Restrições do runtime (Workers)

- Sem APIs exclusivas de Node: senha com PBKDF2 (Web Crypto), sem `bcrypt`/`sharp`; e-mail por SES via HTTP com SigV4 feito à mão (`src/lib/email/sigv4.ts`), sem SMTP.
- Bindings `DB` (D1), `CACHE` (KV), `MEDIA` (R2) só dentro de handlers, via `getBindings()`/`getDb()` (`src/lib/cloudflare.ts`, `src/db/index.ts`). Nunca no top-level de módulo.
- O app roda sob mount path (`/app`). Nunca hardcode caminho absoluto nem domínio: base path vem de `BASE_URL`/`NEXT_PUBLIC_BASE_PATH`, origem pública de `APP_ORIGIN` (o `host` da request é o do worker interno).
- Bucket R2 é privado: imagens passam por `/api/media/...`.
- Webflow Cloud ignora `triggers.crons`; agendamento fica em `.github/workflows/rotina-diaria.yml` chamando `/api/ops/billing` e `/api/ops/sync-portals`.

### Fluxo de uma request no painel

- `src/middleware.ts` (Edge) só verifica o JWT e redireciona por papel — não toca no banco.
- Estado (usuário ativo, revenda suspensa, permissão) é checado nos guards de `src/lib/auth/guards.ts`: `requireTenantPage`/`requireSuperAdminPage` em páginas, `requireApiTenant(permission)`/`requireApiSuperAdmin` em rotas. Permissões em `src/lib/auth/rbac.ts`; recursos por plano com `requireFeature` (`src/lib/api/feature-guard.ts`).
- Route handlers seguem o padrão: `withApi(...)` + `jsonOk` + erros `badRequest/notFound/...` de `src/lib/http.ts` (ZodError vira 400 automaticamente), validação com schemas de `src/lib/validation/`, lógica em `src/lib/services/`, `logAuditFor` em mutações.
- Todo acesso a dados de revenda é escopado por `tenant.id` — dado de outra revenda deve dar 404.
- Tenancy por path concentrada em `src/lib/tenant/resolveTenant.ts`. Bloqueio por inadimplência é calculado a cada request em `src/lib/tenant/billing-rules.ts`; o job só persiste.

### Integrações

- Portais (`src/lib/integrations/` + `src/lib/services/portal-sync*.ts`): ida = fila `vehicle_publications` executada via `waitUntil` após salvar o veículo, pelo botão de sincronizar e pelo cron; volta = `portal-leads.ts` (`registerPortalLead`). Inbox de leads de portal responde HTTP 200 mesmo ao recusar (portal que leva erro desliga a integração). Detalhes por portal (ML, OLX, Webmotors, Chaves na Mão) em `docs/ESTADO.md` §6.
- Segredos de revenda vão para o cofre (`src/lib/security/vault.ts`, `VAULT_KEY`) e nunca voltam para a tela.
- Rastreamento (`src/lib/tracking/`): conversões no navegador e servidor com o mesmo `event_id`; dado pessoal normalizado e com SHA-256.
- Nome do produto vive em `src/lib/brand.ts`. Nomes de infraestrutura (`projetoauto-db`, `projetoauto-media`) ficam de propósito.

### Banco

Drizzle sobre D1/SQLite, schema em `src/db/schema/`. Migrations em `drizzle/` são aditivas: nunca edite uma já aplicada, crie outra. Workers não lê filesystem, então `scripts/bundle-migrations.mjs` embute os `.sql` em `src/db/migrations.generated.ts` e `/api/ops/migrate` aplica o que falta (controle em `_app_migrations`; tolera "already exists"). Após deploy com migration nova, rode o migrate em produção.

## Convenções

- Lint proíbe `alert`/`confirm`/`prompt`: use `useConfirm()` (`@/components/ui/confirm`) e `useToast()` (`@/components/ui/toast`).
- Testes (Vitest, ambiente node) cobrem só lógica pura e casos que já quebraram — nada que dependa de binding do Cloudflare. Ficam ao lado do código (`*.test.ts`) em `src`, `scripts`, `packages/*/src` e `sites/src`.
- Comentário explica o porquê, não o quê.
- Commits em pt-BR, em prosa, dizendo a razão da mudança. Confira o código de saída de typecheck, lint, testes e build antes de commitar.
- Templates de site: seguir o Figma à risca (decisão do dono do produto).
- Tailwind v4: templates em `node_modules` só geram classe via `@source`; use `grid-cols-1` na base de grids, `minmax(0,1fr)` em vez de `1fr`, `min-w-0` para `truncate` em flex. Ids de componente com `useId()`. Mais armadilhas em `docs/ESTADO.md` §11.
- Nunca imprimir tokens/segredos lidos de `process.env`, inclusive em mensagens de erro.
