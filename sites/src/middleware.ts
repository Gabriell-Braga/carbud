import { NextResponse, type NextRequest } from "next/server";

/**
 * Repassa o caminho pedido para quem renderiza.
 *
 * Página do App Router só enxerga os headers, não a URL. Sem isto o
 * redirecionamento para o domínio oficial (`currentSlug`) não saberia para
 * onde mandar, e todo acesso pelo `www` cairia na home.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/((?!_next/|api/|media/).*)" };
