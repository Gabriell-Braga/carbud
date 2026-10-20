import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);
export const unauthorized = (message = "Não autenticado") => new ApiError(401, message);
export const forbidden = (message = "Sem permissão para esta ação") => new ApiError(403, message);
export const notFound = (message = "Não encontrado") => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);
export const tooManyRequests = (message = "Muitas tentativas. Aguarde alguns instantes.") =>
  new ApiError(429, message);

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Dados inválidos",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  console.error("[api] erro não tratado:", error);
  return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
}

/** Envolve um handler de API padronizando erros e resposta JSON. */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

export function clientIp(request: Request): string | null {
  /*
   * Lead que vem do app dos sites chega pelo servidor da Vercel, e o
   * `cf-connecting-ip` é o IP dela: o limite por IP caía sobre todas as
   * revendas juntas. O repasse manda o IP do visitante em `x-visitor-ip`, que
   * só vale com a chave dos sites (sem ela, qualquer um forjaria o cabeçalho
   * para fugir do limite).
   */
  const sitesKey = process.env.SITES_API_KEY;
  const visitorIp = request.headers.get("x-visitor-ip");
  if (sitesKey && visitorIp && request.headers.get("x-sites-key") === sitesKey) {
    return visitorIp;
  }

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}
