"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiDelete } from "@/lib/client/api";

export function DeleteVehicleButton({ vehicleId, label }: { vehicleId: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Excluir anúncio",
      description: `"${label}" e todas as fotos dele saem do ar definitivamente. Para tirar do site sem perder o histórico, mude a situação para "Vendido".`,
      confirmLabel: "Excluir anúncio",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeleting(true);
    const result = await apiDelete(`/api/admin/vehicles/${vehicleId}`);

    if (!result.ok) {
      toast.error(result.error);
      setDeleting(false);
      return;
    }

    router.push("/admin/estoque");
    router.refresh();
  }

  return (
    <Accordion title="Excluir anúncio" defaultOpen={false} className="border-danger/40">
        <p className="mb-4 text-sm text-muted">
          Remove o veículo e todas as fotos definitivamente. Para tirar do site sem perder o
          histórico, mude a situação para &quot;Vendido&quot;.
        </p>
        <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>
          Excluir veículo
        </Button>
    </Accordion>
  );
}
