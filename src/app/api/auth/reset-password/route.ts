import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import { hashResetToken } from "@/lib/auth/reset";
import { badRequest, clientIp, jsonOk, tooManyRequests, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    token: z.string().trim().min(20).max(200),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  });

const INVALID = "Link inválido ou expirado. Peça uma nova redefinição.";

/** Conclui a redefinição: consome o token e derruba as sessões antigas. */
export const POST = withApi(async (request: Request) => {
  const ip = clientIp(request) ?? "desconhecido";
  const limit = await rateLimit(`reset:ip:${ip}`, 20, 3600);
  if (!limit.allowed) throw tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const db = await getDb();
  const tokenHash = await hashResetToken(parsed.data.token);

  const found = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .limit(1);

  const reset = found[0];
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
    throw badRequest(INVALID);
  }

  const userRows = await db.select().from(users).where(eq(users.id, reset.userId)).limit(1);
  const user = userRows[0];
  if (!user || user.status !== "active") throw badRequest(INVALID);

  // sem isso quem recebeu senha provisória escapa da troca obrigatória pelo
  // "esqueci a senha", repetindo a provisória
  if (await verifyPassword(parsed.data.password, user.passwordHash, user.passwordSalt)) {
    throw badRequest("Dados inválidos", [
      { path: ["password"], message: "A nova senha precisa ser diferente da atual" },
    ]);
  }

  const { hash, salt } = await hashPassword(parsed.data.password);
  const now = new Date();

  await db
    .update(users)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: false,
      sessionsValidFrom: now,
    })
    .where(eq(users.id, user.id));

  await db.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, reset.id));

  await logAudit(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      impersonated: false,
    },
    {
      action: "auth.reset_password",
      entity: "user",
      entityId: user.id,
      tenantId: user.tenantId,
    },
    request,
  );

  return jsonOk({ ok: true });
});
