/**
 * Assinatura AWS Signature Version 4.
 *
 * Existe porque o painel roda em Cloudflare Workers, e de lá não sai SMTP: a
 * porta 587 é bloqueada e não há socket. O que sai é HTTPS — então falamos
 * com o SES pela API dele, e toda chamada à API da AWS precisa ser assinada
 * deste jeito. É a razão de a AWS pedir uma "chave de acesso" e não um
 * usuário SMTP.
 *
 * O SDK oficial faria isso, mas ele é grande e depende de APIs de Node que o
 * runtime não tem. A assinatura em si é uma sequência de HMAC-SHA256, que o
 * Web Crypto faz nativamente.
 *
 * Referência: AWS Signature Version 4, "Create a signed request".
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
};

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/**
 * Data no formato que a AWS exige: `20260929T143000Z` e `20260929`.
 *
 * Um relógio adiantado ou atrasado em mais de 15 minutos faz a AWS recusar a
 * chamada com "Signature expired" — vale lembrar quando parecer chave errada.
 */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

async function signingKey(
  credentials: AwsCredentials,
  dateStamp: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(
    new TextEncoder().encode(`AWS4${credentials.secretAccessKey}`),
    dateStamp,
  );
  const kRegion = await hmac(kDate, credentials.region);
  const kService = await hmac(kRegion, credentials.service);
  return hmac(kService, "aws4_request");
}

/**
 * Monta os cabeçalhos assinados de um POST com corpo JSON.
 *
 * Só este caso porque só ele é usado: mandar e-mail. Generalizar para
 * qualquer método e query string dobraria o código e não teria segundo
 * usuário.
 */
export async function signedHeaders(input: {
  credentials: AwsCredentials;
  host: string;
  path: string;
  body: string;
  now?: Date;
}): Promise<Record<string, string>> {
  const { credentials, host, path, body } = input;
  const { amzDate, dateStamp } = amzDates(input.now ?? new Date());

  const payloadHash = await sha256Hex(body);
  const contentType = "application/json";
  const signed = "content-type;host;x-amz-date";

  const canonicalRequest = [
    "POST",
    path,
    "",
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-date:${amzDate}`,
    "",
    signed,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = toHex(await hmac(await signingKey(credentials, dateStamp), stringToSign));

  return {
    "content-type": contentType,
    "x-amz-date": amzDate,
    authorization: `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
}
