import { digitsOf } from "@carbud/site-kit/masks";

export type CepAddress = { street: string; district: string; city: string; state: string };

/**
 * Endereço pelo CEP, direto do navegador no ViaCEP (gratuito, sem chave).
 *
 * Falha devolve `null` e o formulário segue como estava: o preenchimento é
 * atalho, e CEP novo ou serviço fora do ar não pode travar quem digita à mão.
 */
export async function lookupCep(cep: string): Promise<CepAddress | null> {
  const digits = digitsOf(cep);
  if (digits.length !== 8) return null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    return {
      street: data.logradouro ?? "",
      district: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch {
    return null;
  }
}
