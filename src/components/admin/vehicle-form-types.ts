export type VehicleFormValues = {
  id?: string;
  brand: string;
  model: string;
  version: string;
  yearManufacture: number;
  yearModel: number;
  mileageKm: number;
  priceCents: number;
  priceOnRequest: boolean;
  transmission: string;
  fuel: string;
  bodyType: string;
  color: string;
  doors: string;
  licensePlate: string;
  options: string[];
  description: string;
  status: string;
  featured: boolean;
  /** Unidade dona do carro; vazio = nenhuma escolhida. */
  storeId: string;
  /** Referência da FIPE gravada na última consulta. */
  fipeCode: string | null;
  fipePriceCents: number | null;
  fipeReference: string | null;
};
