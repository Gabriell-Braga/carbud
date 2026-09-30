import { z } from "zod";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import {
  emailProvider,
  leadAssignedEmail,
  newLeadEmail,
  passwordResetEmail,
  sendEmail,
  welcomeEmail,
  type EmailContent,
} from "@/lib/email";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";

export const dynamic = "force-dynamic";

const schema = z.object({
  to: z.string().trim().toLowerCase().email("Endereço inválido"),
});

/**
 * Manda uma amostra de cada e-mail do produto para um endereço.
 *
 * Existe para conferir o desenho em cliente de e-mail de verdade. Ler o HTML
 * não serve: o Gmail, o Outlook e o Apple Mail renderizam de formas
 * diferentes, e o que quebra só aparece na caixa de entrada.
 *
 * Todos os dados são de exemplo — nenhum lead, usuário ou token real é
 * tocado. O link de senha aponta para um token que não existe, de propósito:
 * clicar nele mostra a tela de link inválido, e não abre a conta de ninguém.
 */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:billing:write");

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  if (!emailProvider()) {
    throw conflict("Nenhum provedor de e-mail configurado nesta instalação.");
  }

  const origin = await getOrigin();
  const painel = (path: string) => `${origin}${withBasePath(path)}`;

  const lead = {
    leadName: "Ana Souza (exemplo)",
    phone: "(31) 98888-7777",
    email: "ana.souza@exemplo.com",
    message:
      "Tenho interesse nesse Compass. Aceita meu Onix 2019 na troca? Consigo dar entrada de 40 mil.",
    vehicleLabel: "Jeep Compass Longitude 1.3 T270 2023",
    origin: "site",
    url: painel("/admin/leads"),
    tenantName: "Revenda de Exemplo",
    assignedTo: "Carlos Vendedor",
  };

  const amostras: { nome: string; conteudo: EmailContent }[] = [
    { nome: "lead novo", conteudo: newLeadEmail(lead) },
    { nome: "lead atribuído", conteudo: leadAssignedEmail(lead) },
    {
      nome: "redefinir senha",
      conteudo: passwordResetEmail({
        name: context.user.name.split(" ")[0],
        url: painel("/redefinir-senha?token=amostra-sem-valor"),
        minutes: 60,
      }),
    },
    {
      nome: "convite",
      conteudo: welcomeEmail({
        name: context.user.name.split(" ")[0],
        tenantName: "Revenda de Exemplo",
        url: painel("/redefinir-senha?token=amostra-sem-valor"),
        minutes: 60,
        invitedBy: "Equipe Carbud",
      }),
    },
  ];

  const resultados = [];
  for (const amostra of amostras) {
    const resultado = await sendEmail({
      to: parsed.data.to,
      // o prefixo evita confundir amostra com aviso de verdade na caixa
      subject: `[amostra] ${amostra.conteudo.subject}`,
      html: amostra.conteudo.html,
      text: amostra.conteudo.text,
    });
    resultados.push({
      amostra: amostra.nome,
      enviado: resultado.delivered,
      ...(resultado.reason ? { motivo: resultado.reason } : {}),
    });
  }

  const falhou = resultados.find((item) => !item.enviado);
  if (falhou) throw conflict(`"${falhou.amostra}" não saiu: ${falhou.motivo}`);

  return jsonOk({ provedor: emailProvider(), para: parsed.data.to, amostras: resultados });
});
