import { describe, expect, it, vi } from "vitest";
import { amzDates, sha256Hex, signedHeaders } from "./sigv4";
import { explain, sendViaSes, sesPayload, type SesConfig } from "./ses";
import { newLeadEmail, welcomeEmail } from "./templates";

const CREDENCIAIS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "ses",
};

const CONFIG: SesConfig = {
  region: "us-east-1",
  accessKeyId: CREDENCIAIS.accessKeyId,
  secretAccessKey: CREDENCIAIS.secretAccessKey,
  from: "Carbud <nao-responda@carbud.com.br>",
};

describe("SigV4", () => {
  it("formata a data como a AWS exige", () => {
    expect(amzDates(new Date("2026-09-29T14:30:00.000Z"))).toEqual({
      amzDate: "20260929T143000Z",
      dateStamp: "20260929",
    });
  });

  it("calcula o hash do corpo vazio igual ao valor conhecido da AWS", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("monta Authorization com escopo, cabeçalhos assinados e assinatura", async () => {
    const headers = await signedHeaders({
      credentials: CREDENCIAIS,
      host: "email.us-east-1.amazonaws.com",
      path: "/v2/email/outbound-emails",
      body: '{"a":1}',
      now: new Date("2026-09-29T14:30:00.000Z"),
    });

    expect(headers["x-amz-date"]).toBe("20260929T143000Z");
    expect(headers.authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20260929/us-east-1/ses/aws4_request",
    );
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-date");
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  /*
   * A assinatura precisa mudar com o corpo — é o que impede alguém de trocar
   * o destinatário de uma chamada já assinada. Um erro aqui passa despercebido
   * até a AWS recusar tudo.
   */
  it("assinatura muda quando o corpo muda", async () => {
    const base = {
      credentials: CREDENCIAIS,
      host: "email.us-east-1.amazonaws.com",
      path: "/v2/email/outbound-emails",
      now: new Date("2026-09-29T14:30:00.000Z"),
    };
    const um = await signedHeaders({ ...base, body: '{"a":1}' });
    const outro = await signedHeaders({ ...base, body: '{"a":2}' });
    expect(um.authorization).not.toBe(outro.authorization);
  });

  it("o segredo nunca aparece no cabeçalho", async () => {
    const headers = await signedHeaders({
      credentials: CREDENCIAIS,
      host: "email.us-east-1.amazonaws.com",
      path: "/v2/email/outbound-emails",
      body: "{}",
    });
    expect(JSON.stringify(headers)).not.toContain(CREDENCIAIS.secretAccessKey);
  });
});

describe("envio pelo SES", () => {
  const mensagem = {
    to: ["vendedor@revenda.com.br"],
    subject: "Lead novo",
    html: "<p>oi</p>",
    text: "oi",
  };

  it("monta o corpo no formato da API v2", () => {
    const payload = sesPayload({ ...CONFIG, replyTo: "contato@revenda.com.br" }, mensagem);
    expect(payload).toMatchObject({
      FromEmailAddress: CONFIG.from,
      Destination: { ToAddresses: ["vendedor@revenda.com.br"] },
      ReplyToAddresses: ["contato@revenda.com.br"],
    });
    expect(payload.Content.Simple.Subject.Data).toBe("Lead novo");
    expect(payload.Content.Simple.Body.Text.Charset).toBe("UTF-8");
  });

  it("chama o endpoint da região certa, assinado", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await sendViaSes(CONFIG, mensagem, fetcher);

    expect(result).toEqual({ delivered: true });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails");
    expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256");
  });

  it("falha não vira exceção: o lead já está salvo", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await sendViaSes(CONFIG, mensagem, fetcher)).toEqual({
      delivered: false,
      reason: "timeout",
    });
  });

  /*
   * As três recusas comuns do SES são de configuração da conta, e a mensagem
   * crua da AWS não diz o que fazer. A tradução é o que evita abrir chamado.
   */
  it("traduz as recusas comuns em instrução", () => {
    expect(explain(400, "Email address is not verified")).toContain("sandbox");
    expect(explain(403, "The security token included in the request is invalid")).toContain(
      "AWS_ACCESS_KEY_ID",
    );
    expect(explain(429, "Maximum sending rate exceeded")).toContain("limitando");
    expect(explain(500, "")).toBe("O SES recusou o envio (HTTP 500).");
  });
});

describe("textos", () => {
  it("o aviso de lead leva nome e carro no assunto — é o que se lê na notificação", () => {
    const email = newLeadEmail({
      leadName: "Ana Souza",
      phone: "(31) 98888-7777",
      email: "ana@exemplo.com",
      message: "Aceita troca?",
      vehicleLabel: "Jeep Compass 2023",
      origin: "site",
      url: "https://crm.carbud.com.br/app/admin/leads/1",
      tenantName: "Auto Teste",
    });

    expect(email.subject).toBe("Lead novo: Ana Souza — Jeep Compass 2023");
    expect(email.text).toContain("(31) 98888-7777");
    expect(email.html).toContain("https://wa.me/5531988887777");
  });

  it("escapa o que veio de fora: nome de lead é texto de estranho", () => {
    const email = newLeadEmail({
      leadName: '<img src=x onerror="alert(1)">',
      phone: null,
      email: null,
      message: null,
      vehicleLabel: null,
      origin: "site",
      url: "https://exemplo.test",
      tenantName: "Auto Teste",
    });
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });

  it("o convite manda link, nunca a senha", () => {
    const email = welcomeEmail({
      name: "Ana",
      tenantName: "Auto Teste",
      url: "https://crm.carbud.com.br/app/redefinir-senha?token=abc",
      minutes: 60,
      invitedBy: "Gabriel",
    });
    expect(email.html).toContain("redefinir-senha?token=abc");
    expect(email.text).not.toMatch(/senha provis/i);
  });
});
