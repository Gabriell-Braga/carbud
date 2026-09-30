import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { publicEndpointGroups } from "@/lib/public-endpoints";
import { describeOrigin } from "@/lib/seo/urls";

/**
 * Os endereços deste app que estão cadastrados em serviços de fora.
 *
 * É a tela da troca de domínio. O painel vive em `crm.carbud.com.br/app`;
 * quando o domínio muda, `APP_ORIGIN` muda e esta lista muda junto — e cada
 * linha precisa ser recadastrada onde a coluna "onde" diz. Sem a lista, a pessoa
 * descobriria o esquecido pelo sintoma: OAuth voltando para o domínio antigo,
 * cobrança sem webhook, rotina diária em 404.
 *
 * Separada por serviço porque a pergunta do suporte é sempre de um portal só
 * ("o que vai no CALLBACK URL ESTOQUE do Webmotors?"), e numa lista corrida a
 * resposta ficava espalhada em três linhas distantes.
 */
export async function PublicEndpoints() {
  const info = await describeOrigin();
  const groups = publicEndpointGroups(info.origin);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Endereços públicos</CardTitle>
        <CardDescription>
          O que está cadastrado fora do app e precisa ser atualizado quando o domínio mudar. Origem
          atual: <code className="text-xs text-text">{info.origin}</code>
          {info.source === "env" ? " (fixada por APP_ORIGIN)" : " (lida do request)"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {info.internalHost ? (
          <Alert tone="danger">
            APP_ORIGIN não está definida e o request chega pelo host interno do Webflow Cloud. Os
            endereços abaixo estão ERRADOS — defina APP_ORIGIN nas Secret Variables com o domínio
            público: <code>https://crm.carbud.com.br</code>.
          </Alert>
        ) : info.source === "headers" ? (
          <Alert tone="warning">
            APP_ORIGIN não está definida: a origem está vindo do request. Funciona em
            desenvolvimento; em produção, fixe a variável para os links de e-mail e o OAuth não
            dependerem de proxy.
          </Alert>
        ) : null}

        {groups.map((group) => (
          <section key={group.key}>
            <h3 className="text-sm font-semibold text-text">{group.title}</h3>
            <p className="mt-0.5 text-xs text-faint">{group.description}</p>
            <ul className="mt-2 divide-y divide-border border-t border-border">
              {group.endpoints.map((endpoint) => (
                <li
                  key={`${group.key}:${endpoint.label}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{endpoint.label}</p>
                    <p className="text-xs text-faint">{endpoint.where}</p>
                    <code className="mt-1 block break-all text-xs text-muted">{endpoint.url}</code>
                  </div>
                  <CopyButton value={endpoint.url} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="text-xs text-faint">
          Ao trocar o domínio, na ordem: APP_ORIGIN nas Secret Variables → publicar → recadastrar
          cada endereço acima → PANEL_URL na Vercel → OPS_BASE_URL no GitHub. O README tem o
          checklist completo.
        </p>
      </CardContent>
    </Card>
  );
}
