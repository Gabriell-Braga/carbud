/**
 * Cloudflare Turnstile: o captcha das rotas públicas que cobram ou criam conta.
 *
 * Sem `TURNSTILE_SECRET_KEY` a verificação é pulada, para o ambiente local
 * funcionar sem conta na Cloudflare. Em produção as duas chaves precisam estar
 * cadastradas; a página só mostra o widget quando a chave pública existe.
 */
export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

export async function verifyTurnstile(token: unknown, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  body.append("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
