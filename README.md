# Carbud — plataforma para revendas de veículos

Plataforma multi-tenant onde cada revenda de veículos ganha um painel de gestão e um
site público de estoque, tudo administrado por um painel geral (super-admin).

Deploy 100% em **Webflow Cloud** (Next.js + adapter OpenNext → Cloudflare Workers).

## Arquitetura

| Área | Rota | Quem usa |
|---|---|---|
| Painel Geral | `/super-admin` | Equipe interna (super-admin) |
| Painel da Revenda | `/admin` | Dono, vendedores e visualizadores da revenda |
| Site público | `/r/[slug]` | Clientes finais da revenda |
| Rotas operacionais | `/api/ops/*` | Migrations e bootstrap (protegidas por segredo) |

O app é montado num **mount path** do site Webflow (ex.: `crm.carbud.com.br/app`). O `basePath`
vem de `BASE_URL`/`NEXT_PUBLIC_BASE_PATH` — nunca hardcode caminho absoluto.

### Restrições do runtime respeitadas

- Sem APIs exclusivas de Node: senha com **PBKDF2 (Web Crypto)**, nada de `bcrypt`/`sharp`.
- Bindings (`DB`, `CACHE`, `MEDIA`) acessados só dentro de handlers, via `getCloudflareContext()`
  (ver [src/lib/cloudflare.ts](src/lib/cloudflare.ts)).
- Middleware Edge faz apenas verificação criptográfica do JWT — não consulta o banco.
- Sem dependência de ISR/revalidação on-demand: as páginas são SSR com cache leve no KV.
- Bucket R2 é privado: imagens são servidas por route handler (`/api/media/...`).
- Tenancy por path, isolada em [src/lib/tenant/resolveTenant.ts](src/lib/tenant/resolveTenant.ts)
  para permitir migrar a subdomínio/domínio custom sem reescrever o app.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM (D1/SQLite) · Zod · jose (JWT)

## Rodando localmente

```bash
npm install
cp .dev.vars.example .dev.vars      # preencha AUTH_SECRET e OPS_SECRET
npm run preview                      # build OpenNext + wrangler dev (runtime real do Workers)
```

O servidor sobe em `http://127.0.0.1:8787` com D1, KV e R2 locais em `.wrangler/`.

> `npm run dev` (Next puro) é mais rápido para mexer em UI, mas só o `npm run preview`
> reproduz o runtime do Webflow Cloud. Valide sempre no preview antes de commitar.

### Primeira execução

```bash
SECRET="<valor de OPS_SECRET>"

# 1. aplica as migrations
curl -X POST http://127.0.0.1:8787/api/ops/migrate -H "x-ops-secret: $SECRET"

# 2. cria o primeiro super-admin + popula o catálogo de marcas/modelos
curl -X POST http://127.0.0.1:8787/api/ops/bootstrap \
  -H "x-ops-secret: $SECRET" -H "content-type: application/json" \
  -d '{"email":"voce@empresa.com","name":"Seu Nome","password":"suaSenhaForte"}'
```

Depois acesse `http://127.0.0.1:8787/login`.

## Banco de dados

```bash
npm run db:generate     # gera a migration a partir do schema Drizzle
npm run db:bundle       # embute as migrations no bundle (roda sozinho no build)
```

As migrations do Drizzle ficam em `drizzle/` e são **aditivas** — nunca edite um arquivo
já aplicado em produção; gere uma nova migration.

Como o Workers não tem acesso a filesystem, `scripts/bundle-migrations.mjs` transforma os
`.sql` em `src/db/migrations.generated.ts`, e a rota `/api/ops/migrate` aplica o que falta
no banco do ambiente (local ou Webflow Cloud), controlando o que já rodou em `_app_migrations`.

## Variáveis de ambiente (Webflow Cloud)

| Nome | Tipo | Obrigatória | Descrição |
|---|---|---|---|
| `AUTH_SECRET` | Secret | sim | Chave HS256 que assina os JWT de sessão |
| `OPS_SECRET` | Secret | sim | Protege `/api/ops/*` |
| `AWS_SES_REGION` | Variable | para e-mail | Região do SES, ex.: `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Secret | para e-mail | Chave de acesso com permissão `ses:SendEmail` |
| `AWS_SECRET_ACCESS_KEY` | Secret | para e-mail | Segredo da chave acima |
| `EMAIL_REPLY_TO` | Variable | não | Endereço que recebe as respostas |
| `RESEND_API_KEY` | Secret | não | Provedor alternativo ao SES |
| `EMAIL_FROM` | Variable | não | Remetente verificado, ex.: `Carbud <nao-responda@carbud.com.br>` |
| `APP_ORIGIN` | Variable | em produção | Origem pública do painel, sem o mount path (`https://crm.carbud.com.br`). É a variável da troca de domínio — ver abaixo |

`NEXT_PUBLIC_BASE_PATH` **não precisa ser cadastrada**: o [next.config.ts](next.config.ts)
deriva o valor do `BASE_URL` que o Webflow Cloud injeta no build. Como é inlinada no bundle
do cliente, mudar o mount path exige um novo deploy — não basta trocar a variável.

## Nome e domínio

O produto se chama **Carbud**. O nome vive em [src/lib/brand.ts](src/lib/brand.ts) e
tudo que o exibe (aba, login, e-mail, user-agent, cabeçalhos `x-carbud-*` dos webhooks)
lê de lá. Os identificadores de infraestrutura (`wrangler.json`, banco `projetoauto-db`,
bucket `projetoauto-media`, repositório) mantêm o nome antigo de propósito: são recursos
já criados no Webflow Cloud e ninguém de fora os vê.

Domínios: o painel (home, página de vendas e sistema) está em
**https://crm.carbud.com.br/app**; o domínio raiz **carbud.com.br** fica com o portal
proprietário. O código não fixa domínio nenhum — a origem vem de `APP_ORIGIN` e o mount
path de `BASE_URL`, que o Webflow Cloud injeta.

### Checklist da troca de domínio

1. Apontar o domínio novo para o site Webflow e montar o app nele (o Webflow Cloud
   injeta o `BASE_URL` novo no build — se o mount path mudar, é um deploy novo).
2. `APP_ORIGIN` = a origem nova (sem o mount path) nas Secret Variables → publicar.
3. Abrir **Super-admin → Configurações → Endereços públicos** e recadastrar cada linha
   onde ela diz: redirect URI do OAuth nos apps da OLX e do Mercado Livre, URL de
   notificações do Mercado Livre, webhook do Asaas (a saúde do webhook acusa
   "aponta para outro endereço" enquanto estiver no domínio antigo), webhooks do
   WhatsApp das revendas.
4. `PANEL_URL` na Vercel (com o mount path) → novo deploy do app dos sites.
5. Variável `OPS_BASE_URL` no GitHub (Settings → Variables) para a rotina diária, e
   `OPS_BASE_URL` no `.dev.vars` de quem roda `scripts/migrate-remote.mjs`.
6. Domínio do remetente no Resend e `EMAIL_FROM`.

A sessão não migra: o cookie é do host, então quem estava logado no domínio
antigo entra de novo no novo — sem migração de nada.

## Leads dos portais

A integração com classificados vale nos dois sentidos. A ida é o
[portal-sync](src/lib/services/portal-sync.ts): o carro cadastrado vira anúncio. A volta é
o [portal-leads](src/lib/services/portal-leads.ts): quem procura o carro no anúncio entra
como lead no CRM, com etapa do funil, rodízio de vendedor, linha do tempo e webhook — igual
a um lead do site.

O contato chega por dois caminhos, e os dois terminam em `registerPortalLead`:

| Caminho | Como funciona | Onde vale |
|---|---|---|
| O portal avisa, nós buscamos | O portal manda a notificação, a sincronização lê o recurso pela API dele | Mercado Livre (perguntas). Outros portais entram quando tivermos acesso de integrador à API de leads de cada um |
| O portal entrega no nosso endereço | A loja cadastra a URL de leads do Carbud dentro do portal; o contato entra na hora | **Todos**, inclusive os que só recebem o feed |

A URL de entrada é uma por revenda e por portal, aparece em **Portais → card do portal →
"Receber leads deste portal"** e é autenticada por um token derivado do `AUTH_SECRET` —
nada é guardado no banco, e por isso ela pode ser mostrada de novo quando a loja precisar.
O corpo aceita os nomes de campo mais comuns (`nome`/`name`, `telefone`/`phone`,
`mensagem`/`message`, `anuncio_id`/`listing_id`…), em JSON ou formulário, inclusive
embrulhado em `{ "lead": { … } }`. Sem telefone **e** sem e-mail o lead é recusado — com
HTTP 200 e o motivo no corpo, porque portal que leva erro desliga a integração.

Um lead por pessoa por anúncio: a segunda mensagem da mesma pessoa entra como evento no
lead que já existe, e reenvio do mesmo aviso não duplica nada.

## E-mail

Quatro envios: redefinição de senha, convite de usuário novo (com link para
definir a própria senha, nunca a senha no corpo), aviso de lead novo e aviso de
lead atribuído. Os dois últimos são por revenda e **desligados por padrão**, em
**Mensagens → Avisos por e-mail**.

Provedor: **Amazon SES pela API HTTP**, com assinatura SigV4 feita à mão em
[sigv4.ts](src/lib/email/sigv4.ts). Não é SMTP porque não pode ser: o painel
roda em Cloudflare Workers, onde a porta 587 é bloqueada e não existe socket.
Pelo mesmo motivo a AWS pede uma **chave de acesso**, e não um usuário SMTP.
**Resend** continua aceito como alternativa; com os dois configurados, o SES
manda.

Sem provedor nenhum, nada quebra: `sendEmail` devolve `delivered: false` e
cada fluxo segue o plano B (o link de redefinição aparece no Painel Geral, a
senha provisória continua valendo).

O passo a passo da conta AWS está em
[docs/EMAIL-AWS-SES.md](docs/EMAIL-AWS-SES.md).

## Conectores de mídia (pixel, server-side e sinal de venda)

Cada revenda liga os próprios conectores em **Site → Rastreamento**: id do pixel da Meta,
id de medição do GA4, conta e rótulos do Google Ads, e — para o envio pelo servidor — o
token da API de Conversões e o `api_secret` do Measurement Protocol. Os ids são públicos
e ficam em claro; os dois segredos vão para o cofre e nunca voltam para a tela.

O GTM continua existindo em paralelo, para quem prefere montar o próprio contêiner.

**No navegador** ([tracking.tsx](packages/site-kit/src/templates/shared/tracking.tsx)): o
site carrega pixel, gtag e a tag do Ads, e dispara `view_item` na ficha do veículo e
`generate_lead` no envio de qualquer um dos quatro formulários. Quem usa GTM recebe os
mesmos eventos no `dataLayer` como `carbud_*`.

**No servidor** ([src/lib/tracking](src/lib/tracking)): as mesmas conversões saem de novo
pela API de Conversões da Meta e pelo Measurement Protocol do GA4. É o que continua
contando quando o navegador bloqueia o pixel — e o único caminho possível para o que não
acontece em página nenhuma:

| Momento | Evento | De onde |
|---|---|---|
| Formulário do site | `Lead` / `generate_lead` | navegador **e** servidor, com o mesmo `event_id` |
| Lead de portal (ML, OLX, Webmotors…) | `Lead` / `generate_lead` | só servidor — não há navegador do outro lado |
| Lead marcado como **ganho** | `Purchase` / `purchase` | servidor, com e-mail e telefone de quem comprou |
| Carro marcado como **vendido** | `Purchase` / `purchase` | servidor, só quando nenhum lead daquele carro foi ganho |

O `event_id` é o mesmo nos dois lados (o navegador gera, o servidor repete), então a
conversão conta **uma vez**. O da venda é derivado (`sale-lead-<id>`,
`sale-vehicle-<id>`): remarcar não conta de novo.

Dado pessoal sai sempre com SHA-256 e normalizado antes — e-mail em minúsculas, telefone
com o 55 na frente. Sem isso o hash não bate com o que a plataforma tem e a conversão não
é atribuída a ninguém.

O botão **"Enviar evento de teste"** manda um lead de mentira pelo servidor e mostra o que
cada plataforma respondeu, para conferir o token sem esperar um lead de verdade.

## Rotas operacionais

Todas exigem o header `x-ops-secret`.

| Rota | O que faz |
|---|---|
| `POST /api/ops/migrate` | Aplica as migrations pendentes no banco do ambiente |
| `POST /api/ops/bootstrap` | Cria o primeiro super-admin e popula o catálogo de marcas |
| `POST /api/ops/billing` | Roda a régua de inadimplência (aceita `?dryRun=1`) |

### Régua de cobrança

O bloqueio **não depende do job**: [billing-rules.ts](src/lib/tenant/billing-rules.ts) calcula a
situação real a cada request, então uma revenda vencida além da tolerância já cai antes de
qualquer agendador rodar. O `POST /api/ops/billing` existe para o banco refletir isso e para o
histórico registrar quando cada virada aconteceu — agende uma vez por dia em qualquer cron
(Cloudflare, GitHub Actions, cron-job.org):

```bash
curl -X POST https://SEU-DOMINIO/app/api/ops/billing -H "x-ops-secret: $OPS_SECRET"
```

Vencido → `inadimplente` (site continua no ar). Passada a tolerância em dias configurada por
revenda → `suspenso` (site fora do ar e painel restrito conforme `block_mode`).

### Recuperação de senha

`/esqueci-senha` gera um token de uso único válido por 1 hora; o banco guarda apenas o SHA-256
dele. Com `RESEND_API_KEY` + `EMAIL_FROM` configurados o link sai por e-mail. Sem provedor, o
pedido aparece em `/super-admin/usuarios` e o super-admin destrava pelo botão "Redefinir senha"
— o link em si é irrecuperável por design.

## Qualidade

```bash
npm run check    # typecheck + lint + testes
npm run test     # só os testes (Vitest)
```

Os testes cobrem lógica pura: régua de cobrança e acesso, matriz de permissões, hash de senha,
tokens de redefinição, slugs reservados e formatação pt-BR. Nada que dependa de binding do
Cloudflare entra na suíte.

O CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) roda typecheck, lint, testes,
confere se `src/db/migrations.generated.ts` está em dia e faz o build com `BASE_URL=/app`,
igual ao Webflow Cloud.

## Deploy

Push na `main` dispara o deploy automático no Webflow Cloud. Depois de um deploy que traga
migration nova, rode `/api/ops/migrate` apontando para o domínio de produção.

## O que já está pronto

**Painel Geral (`/super-admin`)**
Indicadores da plataforma · CRUD de revendas (slug validado, template, bloqueio) ·
adimplência manual com histórico de pagamentos · usuários da revenda e da plataforma ·
"entrar como revenda" (impersonation) · auditoria filtrável.

**Painel da Revenda (`/admin`)**
Estoque completo com fotos (resize no browser, capa e ordenação) · leads com status,
responsável e anotações · CMS do site (logo, cores, fontes, template, contato, horários,
redes, textos, banners, GTM) · equipe com perfis.

**Site público (`/r/[slug]`)**
Home com destaques e busca · estoque com filtros e ordenação · página do veículo com
galeria, ficha, opcionais, WhatsApp pré-preenchido e formulário de lead · contato ·
SEO com Open Graph, schema.org, sitemap e robots por revenda.

### Perfis de acesso

| Perfil | Estoque | Leads | Site | Usuários |
|---|---|---|---|---|
| `revenda_admin` | total | total | total | total |
| `vendedor` | total | total | leitura | — |
| `visualizador` | leitura | leitura | leitura | — |
| `super_admin` | plataforma inteira (via impersonation para dados de revenda) |

Revenda suspensa: site público sai do ar e o painel entra em somente leitura ou
bloqueio total, conforme `block_mode`.

## Como testar localmente

```bash
npm run preview
```

1. `POST /api/ops/migrate` e `POST /api/ops/bootstrap` (ver acima) na primeira vez.
2. Entre em `/login` com o super-admin e crie uma revenda em `/super-admin/revendas/nova`,
   marcando "criar o usuário administrador agora".
3. Abra `/r/<slug>` — o site já responde, ainda sem veículos.
4. Entre com o usuário da revenda, troque a senha provisória, cadastre um veículo em
   `/admin/estoque/novo`, envie fotos e mude a situação para "Disponível".
5. Volte em `/r/<slug>/estoque`: o veículo aparece. Envie o formulário da página do
   veículo e confira o contato em `/admin/leads`.
6. Em `/super-admin/revendas/<id>?aba=financeiro`, marque a revenda como suspensa:
   `/r/<slug>` passa a mostrar a página de indisponibilidade e o painel fica restrito.
   Registre um pagamento para reativar.
7. Teste o "Entrar como revenda" e confira o registro em `/super-admin/auditoria`.

### O que verificar

- Nenhuma revenda enxerga dado de outra (veículos, leads e usuários são 404 cruzados).
- Rascunho não aparece no site público.
- Fotos são servidas por `/api/media/...` (o bucket é privado).
- `/r/<slug>/sitemap.xml` e `/r/<slug>/robots.txt` respondem com o domínio real.

## Estado e proximos passos

[docs/ESTADO.md](docs/ESTADO.md) descreve onde as coisas estao, por que estao
assim e o que falta. Comece por la.
