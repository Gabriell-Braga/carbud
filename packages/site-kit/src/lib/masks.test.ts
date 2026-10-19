import { describe, expect, it } from "vitest";
import {
  centsToMoney,
  isValidCpf,
  isValidPhone,
  maskCep,
  maskCnpj,
  maskCpf,
  maskInteger,
  maskMoney,
  maskPhone,
  moneyToCents,
} from "./masks";

describe("maskMoney", () => {
  /*
   * Da direita para a esquerda, como maquininha e aplicativo de banco. E o que
   * dispensa a pessoa de digitar virgula e ponto.
   */
  it("cada tecla e um centavo a mais", () => {
    expect(maskMoney("4")).toBe("0,04");
    expect(maskMoney("40")).toBe("0,40");
    expect(maskMoney("4000")).toBe("40,00");
    expect(maskMoney("4000000")).toBe("40.000,00");
  });

  it("aceita de volta o que ela mesma escreveu", () => {
    expect(maskMoney("40.000,00")).toBe("40.000,00");
  });

  it("campo vazio continua vazio, e nao 0,00", () => {
    expect(maskMoney("")).toBe("");
    expect(maskMoney("abc")).toBe("");
  });

  it("ida e volta preserva o valor", () => {
    expect(moneyToCents(maskMoney("4000000"))).toBe(4000000);
    expect(centsToMoney(4000000)).toBe("40.000,00");
    expect(moneyToCents(centsToMoney(13580000))).toBe(13580000);
  });

  it("zero nao vira texto: o campo fica vazio para a pessoa digitar", () => {
    expect(centsToMoney(0)).toBe("");
  });
});

describe("maskPhone", () => {
  it("cresce conforme a pessoa digita", () => {
    expect(maskPhone("3")).toBe("(3");
    expect(maskPhone("31")).toBe("(31");
    expect(maskPhone("3197")).toBe("(31) 97");
    expect(maskPhone("3197306")).toBe("(31) 9730-6");
    expect(maskPhone("31973065499")).toBe("(31) 97306-5499");
  });

  it("fixo de dez digitos tambem fecha certo", () => {
    expect(maskPhone("3135550199")).toBe("(31) 3555-0199");
  });

  it("nao deixa passar de onze digitos", () => {
    expect(maskPhone("319730654991234")).toBe("(31) 97306-5499");
  });

  it("so aceita numero que da para discar", () => {
    expect(isValidPhone("(31) 97306-5499")).toBe(true);
    expect(isValidPhone("(31) 3555-0199")).toBe(true);
    expect(isValidPhone("(31) 973")).toBe(false);
  });
});

describe("maskCpf", () => {
  it("monta pontos e traco na medida", () => {
    expect(maskCpf("529")).toBe("529");
    expect(maskCpf("529982")).toBe("529.982");
    expect(maskCpf("529982247")).toBe("529.982.247");
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("isValidCpf", () => {
  /*
   * CPF errado so aparece quando o banco recusa a proposta, e ai a loja ja
   * gastou o atendimento. Aqui o erro aparece com o documento na mao.
   */
  it("aceita CPF com digitos verificadores corretos", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa quando os verificadores nao batem", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });

  /*
   * Sequencia repetida passa na conta dos digitos e nao e CPF de ninguem: e o
   * que alguem digita para se livrar do campo.
   */
  it("recusa sequencia repetida", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("000.000.000-00")).toBe(false);
  });

  it("recusa comprimento errado", () => {
    expect(isValidCpf("529.982.247")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("maskInteger", () => {
  it("poe o ponto de milhar", () => {
    expect(maskInteger("45000")).toBe("45.000");
    expect(maskInteger("120")).toBe("120");
    expect(maskInteger("")).toBe("");
  });
});

describe("maskCnpj e maskCep", () => {
  it("formatam conforme a pessoa digita e cortam o excesso", () => {
    expect(maskCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskCnpj("112223")).toBe("11.222.3");
    expect(maskCnpj("11.222.333/0001-8199")).toBe("11.222.333/0001-81");
    expect(maskCep("29100")).toBe("29100");
    expect(maskCep("29100000")).toBe("29100-000");
    expect(maskCep("29100-000abc9")).toBe("29100-000");
  });
});
