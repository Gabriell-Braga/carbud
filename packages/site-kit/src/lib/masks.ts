/**
 * Máscaras dos campos do site público.
 *
 * Todas seguem a mesma ideia: a pessoa digita só dígitos e a máscara monta o
 * resto. É o único jeito que não briga com o cursor — máscara que insere
 * separador conforme a posição do texto pula o cursor para o fim quando alguém
 * corrige o meio, e a pessoa desiste de corrigir.
 *
 * Todas são puras e recebem o texto cru do campo, incluindo o que a máscara
 * anterior já tinha escrito.
 */

/** Só os dígitos, que é o que toda máscara daqui usa como entrada. */
export function digitsOf(value: string): string {
  return value.replace(/\D+/g, "");
}

/* -------------------------------------------------------------------------- */
/* Dinheiro                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dinheiro digitado da direita para a esquerda, como numa maquininha.
 *
 * Cada tecla é um centavo a mais: "4" vira "0,04", "40" vira "0,40", "40000"
 * vira "400,00". Parece estranho descrito, mas é o comportamento que todo
 * caixa e todo aplicativo de banco usa, e é o que dispensa a pessoa de digitar
 * vírgula e ponto.
 *
 * O campo mostrava "40000" e a estimativa lia quarenta mil — número certo,
 * apresentação que não parecia dinheiro.
 */
export function maskMoney(value: string): string {
  const digits = digitsOf(value).slice(0, 12);
  if (!digits) return "";

  const cents = Number(digits);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** O que a máscara escreveu, de volta em centavos. */
export function moneyToCents(value: string): number {
  const digits = digitsOf(value).slice(0, 12);
  return digits ? Number(digits) : 0;
}

/** Centavos para o texto que a máscara produziria. */
export function centsToMoney(cents: number): string {
  if (!cents || cents <= 0) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* -------------------------------------------------------------------------- */
/* Telefone                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Telefone brasileiro, fixo ou celular.
 *
 * Cresce conforme a pessoa digita: "31" vira "(31)", o nono dígito empurra o
 * hífen. Corta em onze porque é o máximo com DDD, e deixar digitar além disso
 * só produziria um número que a loja não consegue discar.
 *
 * O 55 do país sai antes do corte: WhatsApp gravado como "5527996361212"
 * aparecia como "(55) 27996-3612", e salvar o formulário gravava o número
 * cortado.
 */
export function maskPhone(value: string): string {
  let all = digitsOf(value);
  if (all.length > 11 && all.startsWith("55")) all = all.slice(2);
  const d = all.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Tem dígitos suficientes para alguém ligar de volta? */
export function isValidPhone(value: string): boolean {
  const d = digitsOf(value);
  return d.length === 10 || d.length === 11;
}

/* -------------------------------------------------------------------------- */
/* CPF                                                                         */
/* -------------------------------------------------------------------------- */

export function maskCpf(value: string): string {
  const d = digitsOf(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Confere os dois dígitos verificadores do CPF.
 *
 * Vale a pena porque CPF errado só aparece muito depois, quando o banco recusa
 * a proposta — e aí a loja já gastou o atendimento. Aqui o erro é apontado
 * enquanto a pessoa ainda está na tela e tem o documento na mão.
 *
 * Sequência repetida ("111.111.111-11") passa na conta dos dígitos e não é CPF
 * de ninguém; é o valor que alguém digita para se livrar do campo.
 */
export function isValidCpf(value: string): boolean {
  const d = digitsOf(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digito = (ateOndeVai: number): number => {
    let soma = 0;
    for (let i = 0; i < ateOndeVai; i++) {
      soma += Number(d[i]) * (ateOndeVai + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/* -------------------------------------------------------------------------- */
/* CNPJ e CEP                                                                  */
/* -------------------------------------------------------------------------- */

export function maskCnpj(value: string): string {
  const d = digitsOf(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function maskCep(value: string): string {
  const d = digitsOf(value).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/* -------------------------------------------------------------------------- */
/* Quilometragem                                                               */
/* -------------------------------------------------------------------------- */

/** Milhar com ponto: "45000" vira "45.000". */
export function maskInteger(value: string): string {
  const d = digitsOf(value).slice(0, 9);
  if (!d) return "";
  return Number(d).toLocaleString("pt-BR");
}
