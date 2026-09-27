import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Em que ambiente a chave do gateway está — e se existe chave.
 *
 * Saiu do formulário de cobrança porque não é um campo: é leitura. Ali no
 * meio dos campos, com um botão "Salvar" embaixo, parecia configuração que
 * alguém ajusta por aqui — e ninguém ajusta: a chave vive nas variáveis
 * secretas. Aqui, ao lado da saúde do webhook, responde a pergunta que a
 * pessoa realmente tem quando abre esta aba: "o gateway está de pé?".
 */
export function GatewayStatus({ environment }: { environment: string | null }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Gateway de pagamento</CardTitle>
        <CardDescription>
          A chave e o token do webhook ficam nas variáveis secretas do Webflow Cloud e não
          aparecem aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!environment ? (
          <Alert tone="warning">
            Nenhuma chave configurada. Contratações em planos automáticos vão falhar até
            cadastrar <code>ASAAS_API_KEY</code>.
          </Alert>
        ) : (
          <div className="flex items-center gap-3">
            <Badge tone={environment === "production" ? "success" : "info"}>
              {environment === "production" ? "Produção" : "Sandbox"}
            </Badge>
            <p className="text-[13px] text-muted">
              {environment === "production"
                ? "Cobranças são reais."
                : "Cobranças são de teste e não geram dinheiro."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
