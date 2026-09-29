import { getDb } from "@/db";
import { passwordResets } from "@/db/schema";
import { RESET_TTL_MINUTES, generateResetToken, hashResetToken, resetExpiresAt } from "@/lib/auth/reset";
import { sendInBackground, welcomeEmail } from "@/lib/email";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";

/**
 * Convite de quem acabou de ser cadastrado.
 *
 * Reaproveita o token de redefinição de senha em vez de inventar um segundo
 * tipo de link: o que a pessoa precisa fazer é exatamente o mesmo — provar
 * que é dona daquele e-mail e escolher uma senha. Um mecanismo só significa
 * uma expiração só, um hash só e um caminho só para auditar.
 *
 * Por que não mandar a senha provisória no corpo: senha em e-mail fica para
 * sempre na caixa de quem recebeu e na de quem encaminhou. A senha provisória
 * continua valendo para quem cadastrou avisar por outro canal; o link é o
 * caminho recomendado.
 *
 * Falhar aqui nunca desfaz a criação do usuário. Sem provedor de e-mail
 * configurado, o convite simplesmente não sai — e quem cadastrou passa a
 * senha provisória como fazia antes.
 */
export async function sendWelcomeInvite(input: {
  userId: string;
  name: string;
  email: string;
  tenantName: string | null;
  invitedBy: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    const token = generateResetToken();

    await db.insert(passwordResets).values({
      userId: input.userId,
      tokenHash: await hashResetToken(token),
      expiresAt: resetExpiresAt(),
      delivered: true,
      requestedIp: "convite",
    });

    const origin = await getOrigin();

    await sendInBackground({
      to: input.email,
      ...welcomeEmail({
        name: input.name.split(" ")[0],
        tenantName: input.tenantName,
        url: `${origin}${withBasePath(`/redefinir-senha?token=${token}`)}`,
        minutes: RESET_TTL_MINUTES,
        invitedBy: input.invitedBy,
      }),
    });
  } catch (error) {
    console.error("[convite] não consegui enviar", input.email, error);
  }
}
