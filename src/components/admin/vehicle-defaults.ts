import type { VehicleFormValues } from "./vehicle-form-types";

/**
 * Valores iniciais de um veículo novo.
 * Fica fora do arquivo "use client" porque a página de cadastro (server
 * component) precisa chamar esta função no servidor.
 */
export function emptyVehicle(): VehicleFormValues {
  return {
    brand: "",
    model: "",
    version: "",
    /*
     * Os anos nascem vazios, não no ano corrente.
     *
     * O ano corrente parecia um chute inofensivo e virava dado errado: quem
     * cadastrava um 1999 escolhia o ano na tabela FIPE, via o "Ano do modelo"
     * mudar para 1999 e não reparava que o "Ano de fabricação" tinha ficado
     * em 2026 — um campo já preenchido não chama atenção. Vazio, a consulta
     * preenche os dois e o que sobrar vazio é cobrado no envio.
     */
    yearManufacture: 0,
    yearModel: 0,
    mileageKm: 0,
    priceCents: 0,
    priceOnRequest: false,
    transmission: "",
    fuel: "",
    bodyType: "",
    color: "",
    doors: "",
    licensePlate: "",
    options: [],
    description: "",
    status: "draft",
    featured: false,
    storeId: "",
    fipeCode: null,
    fipePriceCents: null,
    fipeReference: null,
  };
}
