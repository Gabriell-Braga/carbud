"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client/api";

/*
 * Rascunho → disponível sem abrir a ficha. Quem migrava o estoque de outra
 * loja cadastrava tudo como rascunho e depois não achava como pôr no ar: o
 * único caminho era abrir carro por carro e trocar a situação no meio do
 * formulário. O PATCH é o mesmo da ficha, então limite do plano e portais
 * seguem valendo.
 */
export function PublishVehicleButton({
  vehicleId,
  size = "sm",
}: {
  vehicleId: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function publish() {
    setSaving(true);
    const result = await apiPatch(`/api/admin/vehicles/${vehicleId}`, { status: "available" });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Veículo à venda no site.");
    router.refresh();
  }

  return (
    <Button type="button" size={size} loading={saving} onClick={publish}>
      Colocar à venda
    </Button>
  );
}
