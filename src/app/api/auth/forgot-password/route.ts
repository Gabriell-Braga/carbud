import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  generateResetToken,
  hashResetToken,
  RESET_TTL_MINUTES,
  resetExpiresAt,
} from "@/lib/auth/reset";
import { isEmailConfigured, passwordResetEmail, sendEmail } from "@/lib/email";
import { getEmailCopy } from "@/lib/email/copy-store";
import { badRequest, clientIp, jsonOk, tooManyRequests, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getOrigin } from "@/lib/seo/urls";
import { withBasePath } from "@/lib/paths";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
});

/**
 * Pede a redefinição de senha.
 *
 * Responde sempre a mesma coisa, exista ou não a conta — não dá para descobrir
 * quem tem cadastro. Quando não há provedor de e-mail configurado, o pedido
 * fica registrado e o link é entregue pelo Painel Geral.
 */
export const POST = withApi(async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const { email } = parsed.data;
  const ip = clientIp(request) ?? "desconhecido";

  const byIp = await rateLimit(`forgot:ip:${ip}`, 10, 3600);
  const byEmail = await rateLimit(`forgot:email:${email}`, 3, 3600);
  if (!byIp.allowed || !byEmail.allowed) throw tooManyRequests();

  const genericResponse = jsonOk({
    received: true,
    emailConfigured: isEmailConfigured(),
  });

  const db = await getDb();
  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = found[0];
  if (!user || user.status !== "active") return genericResponse;

  // um pedido em aberto por vez: o anterior deixa de valer
  await db
    .delete(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

  const token = generateResetToken();
  const origin = await getOrigin();
  const url = `${origin}${withBasePath(`/redefinir-senha?token=${token}`)}`;

  const message = passwordResetEmail(
    { name: user.name.split(" ")[0], url, minutes: RESET_TTL_MINUTES },
    await getEmailCopy("passwordReset"),
  );
  const delivery = await sendEmail({ to: user.email, ...message });

  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: await hashResetToken(token),
    expiresAt: resetExpiresAt(),
    delivered: delivery.delivered,
    requestedIp: ip,
  });

  await logAudit(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      impersonated: false,
    },
    {
      action: "auth.forgot_password",
      entity: "user",
      entityId: user.id,
      tenantId: user.tenantId,
      metadata: { delivered: delivery.delivered, reason: delivery.reason },
    },
    request,
  );

  return genericResponse;
});
