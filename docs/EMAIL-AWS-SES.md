# E-mail pelo Amazon SES — passo a passo

Este documento é para quem vai configurar a conta da AWS. Não é preciso saber
programar, e nada aqui exige mexer em código: no fim, você copia três valores
e cola nas variáveis do Webflow Cloud.

Tempo: cerca de 30 minutos de trabalho, mais a espera da AWS liberar o envio
para o público (algumas horas, às vezes um dia).

---

## Antes de começar

**Por que SES e não "SMTP" comum.** O painel roda em Cloudflare Workers, e de
lá não sai conexão SMTP — a porta é bloqueada e não existe socket. O que sai é
HTTPS. Por isso falamos com o SES pela **API** dele, que é HTTPS. Na prática,
para você, muda uma coisa: no fim você copia uma **chave de acesso**
(access key), e **não** um usuário e senha de SMTP. Se alguém já criou um
usuário SMTP nessa conta, ele continua valendo para outros sistemas; o nosso
não usa.

**O que você precisa ter em mãos**
- Acesso ao console da AWS (o login que o Rafael passou).
- Acesso ao DNS do domínio `carbud.com.br` — onde ficam os registros do
  domínio. É lá que se prova para a AWS que o domínio é seu.
- Acesso às variáveis do app no Webflow Cloud.

**Uma decisão antes:** escolha a **região** e use a mesma até o fim. Sugestão:
`us-east-1` (Norte da Virgínia). É a mais barata e a com mais recursos; o
atraso extra para o Brasil é irrelevante em e-mail. Se preferir Brasil, use
`sa-east-1`. O que não pode é verificar o domínio numa região e configurar o
app em outra — a AWS trata cada região como um mundo separado, e o envio falha
dizendo que o domínio não está verificado.

---

## Parte 1 — Verificar o domínio no SES

Isto prova para a AWS que você pode enviar em nome de `carbud.com.br`. Sem
isso, nada sai.

1. Entre no console da AWS.
2. No canto superior direito, confira a **região**. Troque para
   **Leste dos EUA (Norte da Virgínia) us-east-1**.
3. Na busca do topo, escreva **SES** e abra **Amazon Simple Email Service**.
4. No menu da esquerda: **Configuration → Identities**.
5. Botão **Create identity**.
6. Escolha **Domain**.
7. Em **Domain**, escreva `carbud.com.br`.
8. Deixe **Assign a default configuration set** desmarcado.
9. Em **Advanced DKIM settings**, deixe como está: **Easy DKIM**, **RSA_2048_BIT**
   e **Enabled**. O DKIM é a assinatura que faz o Gmail confiar no e-mail; sem
   ele, a chance de cair em spam é alta.
10. Marque **Publish DNS records to Route53** **apenas se** o domínio estiver
    na Route 53 (o DNS da própria AWS). Se o DNS estiver em outro lugar
    (Registro.br, Cloudflare, GoDaddy…), deixe desmarcado.
11. **Create identity**.

A AWS mostra então **3 registros CNAME** com nomes parecidos com
`xxxxxxxx._domainkey.carbud.com.br`.

### Publicar os registros no DNS

Se você marcou a opção da Route 53, pule esta parte: já está feito.

Senão, abra onde o DNS do `carbud.com.br` é administrado e crie os **três**
registros, um por vez, exatamente como a AWS mostra:

| Campo | O que colocar |
|---|---|
| Tipo | CNAME |
| Nome / Host | o que a AWS mostra (algo como `xxxx._domainkey`) |
| Valor / Aponta para | o que a AWS mostra (termina em `.amazonses.com`) |
| TTL | o padrão |

> Cuidado comum: alguns painéis de DNS acrescentam o domínio sozinho. Se o
> campo já mostra `.carbud.com.br` no fim, cole **só** a primeira parte do
> nome. Ficar `xxxx._domainkey.carbud.com.br.carbud.com.br` é o erro que faz a
> verificação nunca completar.

Volte ao SES e espere. O estado da identidade vai de **Pending** para
**Verified**. Costuma levar de alguns minutos a algumas horas.

### Recomendado: DMARC

Ainda no DNS, crie um registro TXT:

| Campo | Valor |
|---|---|
| Tipo | TXT |
| Nome | `_dmarc` |
| Valor | `v=DMARC1; p=none; rua=mailto:seu-email@carbud.com.br` |

Ele não é obrigatório, mas Gmail e Outlook tratam melhor quem tem. `p=none`
significa "só me avise", sem bloquear nada — é o começo certo.

---

## Parte 2 — Sair do modo sandbox

Conta nova do SES começa em **sandbox**: só envia para endereços que você
mesmo verificou. Serve para testar, mas não serve para a operação — o e-mail
de lead vai para vendedor de revenda, que você não vai verificar um por um.

1. No SES, menu da esquerda: **Account dashboard**.
2. Procure o aviso de sandbox e clique em **Request production access**.
3. Preencha:
   - **Mail type**: Transactional.
   - **Website URL**: `https://crm.carbud.com.br`
   - **Use case description**: escreva em inglês, de forma direta. Sugestão:
     > We send transactional emails from our dealership management SaaS:
     > password reset links, account invitations for users created by the
     > dealership, and new-lead notifications to the salespeople of that
     > same dealership. Recipients are our own users and their staff, who
     > create the account themselves. We do not send marketing or bulk email
     > and we do not buy lists. Bounces and complaints are monitored and the
     > affected addresses are removed.
   - **Additional contacts** e o resto: pode deixar em branco.
4. Envie. A resposta costuma vir em até 24 horas.

Enquanto a liberação não sai, dá para testar: em **Identities**, crie uma
identidade do tipo **Email address** com o seu próprio e-mail, confirme o link
que chega nele, e o app consegue enviar para esse endereço.

---

## Parte 3 — Criar a chave de acesso

Aqui é onde a nossa configuração difere de um SMTP comum.

1. Na busca do topo do console, escreva **IAM** e abra.
2. Menu da esquerda: **Users** → **Create user**.
3. **User name**: `carbud-ses` (ou outro nome que diga para que serve).
4. **Next**. Em permissões, escolha **Attach policies directly**.
5. Busque e marque **AmazonSESFullAccess**.
   - Se quiser o mínimo (recomendado, mas opcional): em vez disso, use
     **Create policy** → aba **JSON** → cole o conteúdo abaixo → nomeie
     `carbud-ses-enviar` e anexe essa política ao usuário.
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": ["ses:SendEmail"],
           "Resource": "*"
         }
       ]
     }
     ```
6. **Next** → **Create user**.
7. Abra o usuário recém-criado → aba **Security credentials** → em **Access keys**,
   clique em **Create access key**.
8. Em **Use case**, escolha **Application running outside AWS** (é o nosso caso:
   o app roda na Cloudflare). Marque a confirmação e siga.
9. A AWS mostra **Access key ID** e **Secret access key**.

> **Guarde a Secret access key agora.** Ela aparece **uma única vez**. Se
> fechar a tela sem copiar, não há como recuperar: só apagar essa chave e
> criar outra.
>
> Não mande essas duas linhas por WhatsApp nem por e-mail. Cole direto no
> Webflow Cloud (Parte 4). Se elas vazarem, qualquer um envia e-mail como se
> fosse a Carbud — apague a chave no IAM e crie outra.

---

## Parte 4 — Ligar no app

No Webflow Cloud, no projeto do painel, abra as variáveis de ambiente e
cadastre:

| Nome | Tipo | Valor |
|---|---|---|
| `AWS_SES_REGION` | Variable | `us-east-1` (a mesma da Parte 1) |
| `AWS_ACCESS_KEY_ID` | **Secret** | o Access key ID da Parte 3 |
| `AWS_SECRET_ACCESS_KEY` | **Secret** | a Secret access key da Parte 3 |
| `EMAIL_FROM` | Variable | `Carbud <nao-responda@carbud.com.br>` |
| `EMAIL_REPLY_TO` | Variable (opcional) | endereço que recebe as respostas |

Depois **publique o app** — variável nova só vale a partir do próximo deploy.

O endereço do `EMAIL_FROM` precisa ser do domínio verificado na Parte 1. A
caixa `nao-responda@` não precisa existir de verdade para enviar; se você quer
receber respostas, preencha o `EMAIL_REPLY_TO` com um endereço real.

---

## Parte 5 — Conferir

1. Entre no painel de uma revenda → **Mensagens → Avisos por e-mail**.
2. Ligue **Avisar por e-mail quando entrar um lead**.
3. Clique em **Enviar e-mail de teste**. Ele vai para o seu e-mail de acesso e
   para os endereços cadastrados.
4. Se der erro, a mensagem na tela já diz o que fazer. As três mais comuns:

| Mensagem | O que é |
|---|---|
| "…não confia neste remetente ou destinatário" | O domínio ainda não está **Verified**, ou a conta continua em sandbox e o destinatário não foi verificado |
| "A AWS recusou a credencial" | Chave errada, colada com espaço no fim, ou sem a permissão `ses:SendEmail` |
| "O SES está limitando o envio" | Ainda em sandbox, com limite baixo por segundo |

Depois do teste, confira a caixa de spam. Se o e-mail chegou lá, quase sempre
é o DKIM ainda não propagado ou o DMARC ausente — releia a Parte 1.

---

## O que o app manda hoje

| Quando | Para quem |
|---|---|
| Alguém pede "esqueci minha senha" | A própria pessoa |
| Um usuário é cadastrado (pela revenda ou pelo Painel Geral) | O usuário novo, com link para definir a própria senha |
| Entra um lead pelo site ou por um portal | Vendedor responsável e/ou os endereços cadastrados em Mensagens → Avisos |
| Um lead é atribuído a um vendedor | O vendedor que recebeu |

Os avisos de lead são **desligados por padrão** em cada revenda: quem quiser
recebe, ligando na tela de Mensagens. Redefinição de senha e convite saem
sempre que o provedor estiver configurado.

---

## Custo

O SES cobra por e-mail enviado, na casa de centavos de dólar por mil. Para o
volume de um CRM de revenda (senha, convite, lead), fica perto de zero. Não há
mensalidade.

---

## Se precisar trocar depois

Tudo está atrás das variáveis. Trocar de provedor, de região ou de chave é
trocar variável e publicar — nenhuma linha de código muda. O app também aceita
**Resend** (`RESEND_API_KEY` + `EMAIL_FROM`) como alternativa; se as duas
estiverem configuradas, o SES é usado.
