/**
 * Libera o build do OpenNext no Next 15.
 *
 * O OpenNext recusa versão do Next com mais de 2 anos de lançamento, e o 15
 * (21/10/2024) passou disso em 21/10/2026. A saída oficial é a flag
 * --dangerouslyUseUnsupportedNextVersion, mas o builder do Webflow Cloud monta
 * o comando sozinho e não deixa passar flag. Então o postinstall liga a flag
 * direto no helper.
 *
 * ponytail: remendo em node_modules; sai junto com o upgrade para o Next 16.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = "node_modules/@opennextjs/aws/dist/build/helper.js";
const from = "if (allowUnsupportedNextVersion) {";
const to = "if (true) {";

if (existsSync(file)) {
  const source = readFileSync(file, "utf8");
  if (source.includes(from)) {
    writeFileSync(file, source.replace(from, to));
    console.log("allow-next15: checagem de versão do OpenNext liberada");
  } else if (!source.includes(to)) {
    console.warn("allow-next15: trecho não encontrado em", file, "— o build do OpenNext pode recusar o Next 15");
  }
}
