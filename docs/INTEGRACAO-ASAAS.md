# Integração com o Asaas

Guia de como a cobrança das revendas pelo Asaas funciona no Carbud e do que é
preciso para ligá-la (sandbox e produção). Levantado a partir do código; o
estado e as pendências gerais continuam em [ESTADO.md](ESTADO.md) §9.8 (Asaas) e §9.7 (afiliados).

> **Resumo:** a integração já está escrita. O que falta é configuração
> (segredos + webhook cadastrado no Asaas), migrate em produção e um teste
> ponta a ponta no sandbox.

---

## 1. Mapa do código

| Peça | Arquivo | Papel |
|---|---|---|
| Cliente HTTP | `src/lib/gateway/asaas.ts` | Chamadas à API v3: clientes, assinaturas, cobranças, estorno, webhooks. Credenciais e ambiente. |
| Contratação | `src/lib/gateway/subscribe.ts` | `contractSubscription()` e `cancelTenantSubscription()`: cria cliente + assinatura, cupom, afiliado, promo no cartão. |
| Regra dos eventos | `src/lib/gateway/event-map.ts` | Tradução evento → situação financeira (função pura, testada). |
| Referências | `src/lib/gateway/references.ts` | `externalReference` = id da revenda; `promo:<id>` = 1º pagamento promocional. |
| Datas | `src/lib/gateway/brazil-date.ts` | Vencimentos no fuso de Brasília. |
| Diagnóstico de entrega | `src/lib/gateway/delivery-log.ts` | Última entrega aceita/recusada, no KV. |
| Webhook | `src/app/api/webhooks/asaas/route.ts` | Recebe os eventos, idempotente, sempre 200 depois de autenticado. |
| Régua | `src/lib/tenant/billing-rules.ts` + `src/app/api/ops/billing/route.ts` | Inadimplente → suspenso pela tolerância. Calculado a cada request; o job diário só persiste. |
| Afiliados | `src/lib/services/affiliates.ts`, `src/lib/affiliates/rules.ts` | Comissão sobre pagamentos (consulta `getPayment` no Asaas). |
| Schema | `src/db/schema/subscriptions.ts`, `src/db/schema/plans.ts` | `subscriptions`, `webhook_events`, `plans.billing_mode`, `platform_settings`. |

### Rotas que tocam o Asaas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/public/checkout` | público (`/contratar`) | Cria revenda + usuário + assinatura no cartão. Turnstile, 5/IP/hora. |
| `POST /api/admin/subscription` | revenda (`/admin/assinatura`) | Contratação no cartão pela própria revenda (não em impersonation). 5/hora. |
| `POST/DELETE /api/super-admin/tenants/[id]/subscription` | super-admin | Contratar / cancelar plano da revenda. |
| `GET/POST /api/super-admin/tenants/[id]/payments` | super-admin | Lista cobranças da assinatura direto do Asaas; baixa manual (`receiveInCash`). |
| `GET/POST/PATCH /api/super-admin/gateway` | super-admin | Saúde do webhook, religar fila, trocar ambiente das contratações novas. |
| `GET/POST /api/ops/gateway` | `x-ops-secret` | Diagnóstico (só presença dos segredos) e contratação via operação. |
| `POST /api/webhooks/asaas` | Asaas | Entrada dos eventos. |

Telas: Painel Geral → Configurações (`gateway-status.tsx`, `webhook-health.tsx`),
ficha da revenda (`payments-panel.tsx`), Planos (`plan-editor.tsx`, `coupons-panel.tsx`).

---

## 2. Detalhes do Asaas já resolvidos no cliente

Não “simplifique” estes pontos — cada um já quebrou:

- Autenticação pelo header **`access_token`**, não `Authorization: Bearer`.
- **`User-Agent` obrigatório** (contas criadas após 13/06/2024). O `fetch` do
  Workers não manda; sem ele toda chamada parece erro de credencial. Vem de
  `USER_AGENT` em `src/lib/brand.ts`.
- Valores em **reais decimais** (`toReais`/`toCents`), datas `AAAA-MM-DD` no
  fuso de Brasília (`toAsaasDate`).
- Telefone sem o `55` do país (`toAsaasPhone`); número inválido é omitido.
- Erro do Asaas vira `AsaasError` (estende `ApiError`): 400/422 → 400,
  404 → 404, resto (inclusive 401 da nossa chave) → 502. A mensagem em
  português do Asaas chega à tela.
- O ambiente sai do **prefixo da chave**: `$aact_prod_` = produção, qualquer
  outro (ex.: `$aact_hmlg_`) = sandbox.
  - Produção: `https://api.asaas.com/v3`
  - Sandbox: `https://api-sandbox.asaas.com/v3`

---

## 3. Configuração (passo a passo)

### 3.1 Segredos

Dois pares, um por ambiente (ver `.dev.vars.example`):

| Variável | Conteúdo |
|---|---|
| `ASAAS_API_KEY` | Chave principal (normalmente produção, `$aact_prod_...`). |
| `ASAAS_WEBHOOK_TOKEN` | Token do webhook do ambiente da chave principal. |
| `ASAAS_SANDBOX_API_KEY` | Chave do sandbox (`$aact_hmlg_...`). |
| `ASAAS_SANDBOX_WEBHOOK_TOKEN` | Token do webhook do sandbox. |

- **Local:** em `.dev.vars`, de preferência **só o par do sandbox** — com a
  chave de produção ali, um teste vira cobrança real.
- **Produção:** Secret Variables do Webflow Cloud e novo deploy. A chave de
  produção **nunca** passa por chat (ESTADO §10).
- A chave de sandbox que vazou no histórico deve ser rotacionada.

### 3.2 Webhook no painel do Asaas

O código **não cria o webhook sozinho** (`createWebhook` existe em
`asaas.ts`, mas nada o chama). Cadastre à mão em cada ambiente
(Integrações → Webhooks):

- **URL:** `<APP_ORIGIN><BASE_URL>/api/webhooks/asaas`
  (ex.: `https://crm.carbud.com.br/app/api/webhooks/asaas`). A tela de saúde
  mostra a URL esperada e acusa se o cadastro aponta para domínio antigo.
- **Token de autenticação:** o mesmo valor de `ASAAS_WEBHOOK_TOKEN` (ou
  `ASAAS_SANDBOX_WEBHOOK_TOKEN`). Se o Asaas gerar o token, copie na hora —
  ele aparece uma vez só.
- **API v3, envio sequencial**, ativo.
- **Eventos** (lista `WEBHOOK_EVENTS`):
  `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`,
  `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`,
  `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`,
  `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`,
  `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`,
  `PAYMENT_REFUND_DENIED`, `PAYMENT_RECEIVED_IN_CASH_UNDONE`,
  `PAYMENT_DUNNING_RECEIVED`.

Depois de cadastrado, o botão “religar” do Painel Geral
(`POST /api/super-admin/gateway`) reaplica a lista de eventos e destrava a
fila — útil quando faltar evento ou a fila estiver interrompida.

### 3.3 Banco

Rodar `POST /api/ops/migrate` em produção (a 0027 traz as tabelas de
comissão de afiliado). As tabelas de assinatura vêm da 0003.

### 3.4 Ambiente ativo e parâmetros

Painel Geral → Configurações:

- **Ambiente** (`platform_settings.gateway_environment`, padrão `production`):
  decide **só onde nascem contratações novas**. Assinatura existente fica no
  ambiente em que nasceu (`subscriptions.gateway_environment`, `null` =
  produção) e cancelar/listar vai para lá. O webhook aceita os dois tokens.
- Multa (`fine_percent`, 2%), juros ao mês (`interest_percent`, 1%), trial
  padrão, tolerância padrão (`default_grace_days`, 5) e se o Asaas notifica o
  pagador (`gateway_notifications`).

### 3.5 Planos

- `plans.billing_mode = "gateway"`: cobra pelo Asaas.
- `plans.billing_mode = "manual"` (Enterprise): não toca no Asaas; assinatura
  local e cobrança por fora. Não aceita contratação no cartão.
- `plans.cycle`: `MONTHLY | QUARTERLY | SEMIANNUALLY | YEARLY`.
- A revenda precisa de **CNPJ/CPF** cadastrado (o Asaas exige).

### 3.6 Conferir

```bash
curl -s -H "x-ops-secret: $OPS_SECRET" "https://crm.carbud.com.br/app/api/ops/gateway"
```

```bash
curl -s -H "x-ops-secret: $OPS_SECRET" "https://crm.carbud.com.br/app/api/ops/gateway?slug=<slug-da-revenda>"
```

O primeiro diz se os segredos estão presentes, se a chave autentica e se há
webhook apontando para cá. O segundo mostra situação gravada x real,
assinatura e os últimos eventos da revenda.

---

## 4. Fluxos

### 4.1 Contratação (`contractSubscription`)

1. Valida revenda, plano ativo e que não exista assinatura no gateway
   (trocar de plano = cancelar antes).
2. Resolve cupom (percentual ou fixo) e afiliado; grava a afiliação **antes**
   de chamar o Asaas.
3. Cria ou atualiza o **cliente** (`externalReference` = id da revenda). O
   cliente só é reaproveitado se for do mesmo ambiente.
4. Se for **cartão com promo**: cobrança avulsa de R$ 5
   (`PROMO_FIRST_PAYMENT_CENTS`, referência `promo:<tenantId>`). Recusa = 400
   do Asaas e nada é gravado. Se vier `creditCardToken`, ele é usado na
   assinatura.
5. Cria a **assinatura** (`externalReference` = id da revenda, multa, juros,
   desconto, cartão). Primeiro vencimento:
   - promo: mesmo dia do mês seguinte (29–31 viram 28);
   - senão: trial do plano/padrão, ou o próximo `dueDay` (fuso de Brasília).
6. Falhou a assinatura depois do promo → **estorna** os R$ 5.
7. Grava `subscriptions`, queima o cupom, espelha plano/valor/vencimento em
   `billing_status` e invalida caches.

Dados do cartão só atravessam o Worker: não são gravados, logados nem
auditados. O `remoteIp` enviado é o de quem digitou (antifraude do Asaas).

### 4.2 Webhook

1. Autentica pelo header `asaas-access-token`, comparando em tempo constante
   com os tokens dos dois ambientes; o que confere define o ambiente.
   Sem token/errado → 401 e marca “recusada” no KV.
2. Depois de autenticado, **responde 200 sempre** — resposta diferente de 200
   faz o Asaas interromper a fila inteira até alguém religar.
3. Idempotência por `webhook_events.id` (id do evento). `processed_at` só é
   gravado depois dos efeitos; falha grava `error` e o reenvio reprocessa.
4. Revenda por `externalReference` → `gatewaySubscriptionId` →
   `gatewayCustomerId`.
5. Aplica `event-map.ts`:

| Evento | Efeito |
|---|---|
| `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | adimplente, assinatura `active`, registra pagamento e empurra vencimento (uma vez por cobrança). |
| `PAYMENT_OVERDUE` | inadimplente, `past_due`. |
| `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` | inadimplente, `past_due`. |
| `PAYMENT_CREATED/UPDATED/DELETED/RESTORED`, `CHARGEBACK_DISPUTE`, `AWAITING_CHARGEBACK_REVERSAL` | só nota no histórico. |
| demais (estornos parciais etc.) | ignorados na cobrança; usados pela comissão de afiliado. |

   Pagamento promocional (`promo:`) marca adimplente **sem** empurrar
   vencimento.
6. Comissão de afiliado roda à parte, mesmo se a cobrança falhou.

Nada no webhook bloqueia acesso: quem corta é `effectiveBillingStatus()`,
com a tolerância, a cada request.

### 4.3 Cancelamento

`cancelTenantSubscription` faz `DELETE /subscriptions/{id}` no ambiente da
assinatura (erro do gateway não trava), marca `canceled` e limpa o
`gatewaySubscriptionId`.

---

## 5. Teste ponta a ponta no sandbox

1. `.dev.vars` só com `ASAAS_SANDBOX_API_KEY` e `ASAAS_SANDBOX_WEBHOOK_TOKEN`.
2. Webhook do sandbox apontando para uma URL pública (deploy de preview ou
   túnel para o `npm run preview`).
3. Painel Geral → Configurações → ambiente **sandbox**.
4. Revenda com CNPJ válido de teste; plano com `billing_mode = gateway`.
5. Contratar por `/admin/assinatura` ou `/contratar?plano=<slug>` com os
   cartões de teste do Asaas (aprovado e recusado).
6. Na ficha da revenda, listar cobranças e usar **receber em dinheiro**: isso
   dispara `PAYMENT_RECEIVED` e o webhook deve marcar adimplente e avançar o
   vencimento.
7. Conferir em `GET /api/ops/gateway?slug=...` e na saúde do webhook.
8. Testar recusa do cartão no checkout (a revenda criada deve ser apagada) e
   cancelamento.

---

## 6. Pendências e pontos de atenção encontrados

- **Testar ponta a ponta no sandbox** — ainda não foi feito (ESTADO §9.8).
- **Tokenização de cartão** em produção: pedir ao gerente do Asaas. Sem ela a
  assinatura revalida o cartão com os dados (funciona), mas alterar valor ou
  vencimento de assinatura no cartão depois fica bloqueado.
- **Webhook não é criado pelo sistema**: cadastro manual nos dois ambientes.
  Se quiser automatizar, `createWebhook()` já existe e só precisa de uma rota
  que guarde o `authToken` devolvido (ele aparece uma vez).
- **Vencimento sempre avança 1 mês no webhook**: `applyOutcome` chama
  `advanceDueDate(from, "MONTHLY")` fixo, ignorando `plans.cycle`. Plano
  trimestral/semestral/anual pago ficaria “vencido” depois de um mês na régua
  local. Corrigir usando o ciclo do plano antes de vender planos não mensais.
- **Troca de plano** não usa `updateSubscription`: hoje é cancelar e contratar
  de novo.
- Depois de migrar para o domínio novo, **atualizar a URL do webhook** no
  Asaas (a tela de saúde acusa “aponta para outro endereço”).
- Religar o webhook de produção para assinar os eventos de estorno novos
  (ESTADO §9.7).
- Revisão jurídica dos Termos (`/termos`, `TERMS_VERSION`) antes de vender.
