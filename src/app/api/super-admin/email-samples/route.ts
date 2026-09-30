import { z } from "zod";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import {
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATES,
  emailProvider,
  sampleEmail,
  sendEmail,
} from "@/lib/email";
import { getEmailCopyOverrides } from "@/lib/email/copy-store";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";
import { emailTemplateSchema } from "@/lib/validation/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  to: z.string().trim().toLowerCase().email("Endereço inválido"),
  /** Um modelo só. Sem ele, vão os quatro, com os textos gravados. */
  template: z.enum(EMAIL_TEMPLATE_KEYS).optional(),
  /** Rascunho do editor, para testar antes de salvar. */
  copy: z.unknown().optional(),
});

/**
 * Manda amostra dos e-mails do produto para um endereço.
 *
 * Existe para conferir o desenho em cliente de e-mail de verdade. Ler o HTML
 * não serve: o Gmail, o Outlook e o Apple Mail renderizam de formas
 * diferentes, e o que quebra só aparece na caixa de entrada.
 *
 * Com `template` e `copy`, manda o rascunho do editor — dá para ver o texto
 * novo chegando antes de ele valer para as revendas.
 *
 * Todos os dados são de exemplo — nenhum lead, usuário ou token real é
 * tocado (ver `sampleEmail`).
 */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:billing:write");

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  if (!emailProvider()) {
    throw conflict("Nenhum provedor de e-mail configurado nesta instalação.");
  }

  const origin = await getOrigin();
  const sample = {
    panelUrl: (path: string) => `${origin}${withBasePath(path)}`,
    userName: context.user.name.split(" ")[0],
  };

  const saved = await getEmailCopyOverrides();
  const keys = parsed.data.template ? [parsed.data.template] : [...EMAIL_TEMPLATE_KEYS];

  let draft = null;
  if (parsed.data.template && parsed.data.copy !== undefined) {
    const checked = emailTemplateSchema.safeParse({
      key: parsed.data.template,
      copy: parsed.data.copy,
    });
    if (!checked.success) throw badRequest("Dados inválidos", checked.error.issues);
    draft = checked.data.copy;
  }

  const resultados = [];
  for (const key of keys) {
    const conteudo = sampleEmail(key, sample, draft ?? saved[key]);
    const resultado = await sendEmail({
      to: parsed.data.to,
      // o prefixo evita confundir amostra com aviso de verdade na caixa
      subject: `[amostra] ${conteudo.subject}`,
      html: conteudo.html,
      text: conteudo.text,
    });
    resultados.push({
      amostra: EMAIL_TEMPLATES[key].name,
      enviado: resultado.delivered,
      ...(resultado.reason ? { motivo: resultado.reason } : {}),
    });
  }

  const falhou = resultados.find((item) => !item.enviado);
  if (falhou) throw conflict(`"${falhou.amostra}" não saiu: ${falhou.motivo}`);

  return jsonOk({ provedor: emailProvider(), para: parsed.data.to, amostras: resultados });
});
