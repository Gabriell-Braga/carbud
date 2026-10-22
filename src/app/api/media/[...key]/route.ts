import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getBindings } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

/** Um ano: as chaves incluem um uuid, então o conteúdo nunca muda no mesmo caminho. */
const MAX_AGE = 31536000;

/**
 * Serve arquivos do Object Storage.
 *
 * O Webflow Cloud não suporta bucket público, então todo asset passa por aqui.
 * Como request é o recurso caro do plano, a rota trabalha em camadas antes de
 * tocar o bucket:
 *   1. etag do navegador bate -> 304 sem corpo;
 *   2. cache do edge -> responde sem ler o R2;
 *   3. leitura no R2 (condicional) e gravação no cache do edge.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    return await serve(request, params);
  } catch (error) {
    /*
     * Sem isto, qualquer exceção aqui virava 500 de CORPO VAZIO.
     *
     * Foi o que aconteceu em produção: as fotos sumiram do site e a resposta
     * não dizia nada. Pior, chave inexistente devolvia 500 em vez de 404 — o
     * que apagava a única pista de que a falha era ANTES da leitura, e não na
     * leitura.
     *
     * A rota é pública, então a mensagem é curta e não descreve a
     * infraestrutura. O detalhe fica em /api/ops/bindings, atrás do segredo.
     */
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Não consegui servir este arquivo.\n${resumo(detail)}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

/** Uma linha, sem caminho de arquivo nem pilha — a rota é pública. */
function resumo(detail: string): string {
  return detail.split("\n")[0].slice(0, 120);
}

async function serve(
  request: Request,
  params: Promise<{ key: string[] }>,
): Promise<Response> {
  const { key } = await params;
  const objectKey = key.map((segment) => decodeURIComponent(segment)).join("/");

  if (objectKey.includes("..")) {
    return new Response("Chave inválida", { status: 400 });
  }

  const knownEtag = normalizeEtag(request.headers.get("if-none-match"));
  const edgeCache = getEdgeCache();
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });

  // 1 + 2: o cache do edge responde sem tocar no bucket
  const cached = await cacheMatch(edgeCache, cacheKey);
  if (cached) {
    if (knownEtag && normalizeEtag(cached.headers.get("etag")) === knownEtag) {
      return notModified(cached.headers);
    }
    return cached;
  }

  const { MEDIA } = await getBindings();

  /*
   * Binding ausente é problema de instalação, não do pedido.
   *
   * Sem esta checagem, `MEDIA.get` estoura em cima de `undefined` e o erro que
   * chega é "cannot read properties of undefined" — que não diz a ninguém que
   * falta configurar o bucket no painel do Webflow Cloud.
   */
  if (!MEDIA) {
    return new Response("Armazenamento de imagens não configurado nesta instalação.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Get condicional: o R2 devolve o objeto sem corpo quando o etag ainda vale.
  // Montado à mão porque o Headers do Next não é a classe que o binding espera.
  const object = await MEDIA.get(
    objectKey,
    knownEtag ? { onlyIf: { etagDoesNotMatch: knownEtag } } : undefined,
  );
  if (!object) return new Response("Arquivo não encontrado", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("cache-control", `public, max-age=${MAX_AGE}, immutable`);
  /*
   * Logo e favicon aceitam SVG, que é código. Aberto direto no navegador, ele
   * rodaria script na origem do painel, junto do cookie de sessão. `sandbox`
   * isola o documento; dentro de <img> nada disso pesa, a imagem segue igual.
   */
  // o PDF do laudo fica de fora: o leitor de PDF do Chrome não abre em documento com sandbox
  if (object.httpMetadata?.contentType !== "application/pdf") {
    headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  }
  headers.set("x-content-type-options", "nosniff");
  if (object.httpEtag) headers.set("etag", object.httpEtag);

  const hasBody = "body" in object && object.body;
  if (!hasBody || (knownEtag && normalizeEtag(object.httpEtag) === knownEtag)) {
    return notModified(headers);
  }

  headers.set("content-length", String(object.size));
  const response = new Response(object.body as unknown as ReadableStream, { headers });

  if (edgeCache && !cacheProibido) {
    const context = await getCloudflareContextSafe();
    context?.ctx.waitUntil(cachePut(edgeCache, cacheKey, response.clone()));
  }

  return response;
}

/** 304 carrega validação e cache, nunca corpo nem content-length. */
function notModified(source: Headers): Response {
  const headers = new Headers();
  for (const name of ["etag", "cache-control", "content-type", "content-security-policy"]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(null, { status: 304, headers });
}

function normalizeEtag(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/^W\//, "").replaceAll('"', "").trim();
  return normalized || null;
}

type EdgeCache = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

/**
 * O cache do edge existe, mas pode ser proibido.
 *
 * No Webflow Cloud, `caches.default` ESTÁ lá — só que qualquer chamada estoura
 * com "This Worker is not permitted to access the default cache". Testar a
 * existência do objeto não bastava: ele existe. Foi assim que as fotos ficaram
 * fora do ar sem ninguém entender o motivo.
 *
 * Depois da primeira recusa a resposta fica guardada, para não pagar uma
 * exceção por requisição pelo resto da vida do isolate.
 */
let cacheProibido = false;

function getEdgeCache(): EdgeCache | null {
  if (cacheProibido) return null;
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;
}

/** Cache é otimização: quando ele recusa, a resposta certa é seguir sem ele. */
async function cacheMatch(cache: EdgeCache | null, key: Request): Promise<Response | undefined> {
  if (!cache) return undefined;
  try {
    return await cache.match(key);
  } catch {
    cacheProibido = true;
    return undefined;
  }
}

async function cachePut(cache: EdgeCache, key: Request, response: Response): Promise<void> {
  try {
    await cache.put(key, response);
  } catch {
    cacheProibido = true;
  }
}

async function getCloudflareContextSafe() {
  try {
    return await getCloudflareContext({ async: true });
  } catch {
    return null;
  }
}
