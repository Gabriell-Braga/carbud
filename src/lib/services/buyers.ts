import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  buyerCodes,
  buyerFavorites,
  buyers,
  buyerSessions,
  type Buyer,
  type FavoriteSnapshot,
} from "@/db/schema";
import { generateResetToken, hashResetToken } from "@/lib/auth/reset";
import { sendEmail } from "@/lib/email";
import { buyerCodeEmail } from "@/lib/email/templates";
import { getOrigin } from "@/lib/seo/urls";
import { ApiError, badRequest, tooManyRequests, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Conta de comprador do Portal Carbud: código por e-mail, sem senha.
 *
 * O portal não tem banco; chama estas funções pelas rotas
 * `/api/public/portal/auth/*` e `/me/*` com a chave dos sites e repassa o
 * token da sessão que guarda em cookie httpOnly no domínio dele.
 */

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
const SESSION_DAYS = 30;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Seis dígitos sem viés de módulo: descarta o pedaço do intervalo que não divide por 10⁶. */
export function generateCode(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

/*
 * O e-mail entra no hash para o mesmo código de pessoas diferentes não dar o
 * mesmo hash. Seis dígitos continuam quebráveis com o banco em mãos, mas o
 * código vale 10 minutos e morre no primeiro uso.
 */
function hashCode(email: string, code: string): Promise<string> {
  return hashResetToken(`${email}:${code}`);
}

/**
 * Manda um código novo. Responde igual para e-mail com ou sem conta: a tela
 * não pode servir para descobrir quem é cliente.
 *
 * `devCode` só sai fora de produção e sem provedor de e-mail, para dar para
 * testar o fluxo local sem Resend.
 */
export async function startChallenge(rawEmail: string, ip: string | null) {
  const email = normalizeEmail(rawEmail);
  const byEmail = await rateLimit(`buyer-code:email:${email}`, 5, 15 * 60);
  const byIp = await rateLimit(`buyer-code:ip:${ip ?? "desconhecido"}`, 20, 3600);
  if (!byEmail.allowed || !byIp.allowed) throw tooManyRequests("Muitos códigos pedidos. Aguarde alguns minutos.");

  const code = generateCode();
  const db = await getDb();
  await db.insert(buyerCodes).values({
    email,
    codeHash: await hashCode(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
  });

  const result = await sendEmail({ to: email, ...buyerCodeEmail({ code, minutes: CODE_TTL_MINUTES, origin: await getOrigin() }) });
  const devCode = !result.delivered && process.env.NODE_ENV !== "production" ? code : undefined;
  if (!result.delivered && !devCode) throw new ApiError(503, "Não foi possível enviar o e-mail agora. Tente novamente.");
  return { sent: true, devCode };
}

export type BuyerView = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  marketingOptIn: boolean;
};

export function buyerView(buyer: Buyer): BuyerView {
  return { id: buyer.id, email: buyer.email, name: buyer.name, phone: buyer.phone, marketingOptIn: buyer.marketingOptIn };
}

/** Confere o código, cria a conta se for o primeiro acesso e abre a sessão. */
export async function verifyChallenge(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  const db = await getDb();
  const [pending] = await db
    .select()
    .from(buyerCodes)
    .where(and(eq(buyerCodes.email, email), isNull(buyerCodes.usedAt)))
    .orderBy(desc(buyerCodes.createdAt))
    .limit(1);

  // a tela diferencia "expirou" de "errou": um pede código novo, o outro deixa tentar de novo
  if (!pending || pending.expiresAt.getTime() < Date.now() || pending.attempts >= MAX_CODE_ATTEMPTS) {
    throw badRequest("Este código expirou. Peça um novo.", { reason: "expired" });
  }
  if (pending.codeHash !== (await hashCode(email, code))) {
    await db.update(buyerCodes).set({ attempts: pending.attempts + 1 }).where(eq(buyerCodes.id, pending.id));
    throw badRequest("Código inválido. Tente novamente.", { reason: "invalid" });
  }
  await db.update(buyerCodes).set({ usedAt: new Date() }).where(eq(buyerCodes.id, pending.id));
  return openSession(email);
}

/** Cria a conta no primeiro acesso e abre a sessão. `name` só preenche conta que ainda não tem nome. */
async function openSession(email: string, name?: string) {
  const db = await getDb();
  const [buyer] = await db
    .insert(buyers)
    .values({ email, name: name || null })
    .onConflictDoUpdate({ target: buyers.email, set: { updatedAt: new Date(), ...(name && { name: sql`coalesce(${buyers.name}, ${name})` }) } })
    .returning();

  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(buyerSessions).values({ buyerId: buyer.id, tokenHash: await hashResetToken(token), expiresAt });

  return { token, expiresAt: expiresAt.toISOString(), isNew: !buyer.name, buyer: buyerView(buyer) };
}

type GoogleTokenInfo = { aud?: string; iss?: string; email?: string; email_verified?: string; name?: string; exp?: string };

/**
 * "Entrar com Google": o portal faz o OAuth e manda o id_token; quem confia
 * nele é o painel, conferindo no próprio Google (tokeninfo valida assinatura
 * e validade) que o token foi emitido para o nosso client e com e-mail verificado.
 */
export async function verifyGoogle(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new ApiError(503, "Login com Google não está configurado.");

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`).catch(() => null);
  const info = response?.ok ? ((await response.json()) as GoogleTokenInfo) : null;
  if (
    !info?.email ||
    info.aud !== clientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(info.iss ?? "") ||
    info.email_verified !== "true" ||
    Number(info.exp) * 1000 < Date.now()
  ) {
    throw unauthorized("Não foi possível entrar com o Google. Tente novamente.");
  }

  return openSession(normalizeEmail(info.email), info.name?.trim().slice(0, 120));
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

/** Comprador da sessão do cabeçalho `Authorization`, ou 401. */
export async function requireBuyer(request: Request): Promise<Buyer> {
  const token = bearer(request);
  if (!token) throw unauthorized();
  const db = await getDb();
  const [row] = await db
    .select({ buyer: buyers })
    .from(buyerSessions)
    .innerJoin(buyers, eq(buyers.id, buyerSessions.buyerId))
    .where(and(eq(buyerSessions.tokenHash, await hashResetToken(token)), gt(buyerSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) throw unauthorized("Sessão expirada. Entre de novo.");
  return row.buyer;
}

export async function endSession(request: Request): Promise<void> {
  const token = bearer(request);
  if (!token) return;
  const db = await getDb();
  await db.delete(buyerSessions).where(eq(buyerSessions.tokenHash, await hashResetToken(token)));
}

export async function updateBuyer(
  buyer: Buyer,
  input: { name?: string; phone?: string | null; marketingOptIn?: boolean },
): Promise<BuyerView> {
  const db = await getDb();
  const optInChanged = input.marketingOptIn !== undefined && input.marketingOptIn !== buyer.marketingOptIn;
  const [updated] = await db
    .update(buyers)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(optInChanged && { marketingOptIn: input.marketingOptIn, marketingOptInAt: input.marketingOptIn ? new Date() : null }),
    })
    .where(eq(buyers.id, buyer.id))
    .returning();
  return buyerView(updated);
}


export async function listFavorites(buyerId: string): Promise<FavoriteSnapshot[]> {
  const db = await getDb();
  const rows = await db
    .select({ snapshot: buyerFavorites.snapshot })
    .from(buyerFavorites)
    .where(eq(buyerFavorites.buyerId, buyerId))
    .orderBy(desc(buyerFavorites.createdAt));
  return rows.map((row) => row.snapshot);
}

export async function saveFavorite(buyerId: string, snapshot: FavoriteSnapshot): Promise<void> {
  const db = await getDb();
  await db
    .insert(buyerFavorites)
    .values({ buyerId, vehicleId: snapshot.id, snapshot })
    .onConflictDoUpdate({ target: [buyerFavorites.buyerId, buyerFavorites.vehicleId], set: { snapshot } });
}

export async function removeFavorite(buyerId: string, vehicleId: string): Promise<void> {
  const db = await getDb();
  await db.delete(buyerFavorites).where(and(eq(buyerFavorites.buyerId, buyerId), eq(buyerFavorites.vehicleId, vehicleId)));
}
