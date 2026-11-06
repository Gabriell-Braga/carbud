"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DISTRIBUTION_MODES } from "@/db/schema";
import { DISTRIBUTION_MODE_LABELS } from "@/lib/catalog/labels";
import { apiPatch } from "@/lib/client/api";

const HINTS: Record<string, string> = {
  off: "Os leads chegam sem dono e alguém escolhe na mão.",
  round_robin: "Cada lead novo vai para a próxima pessoa da fila, em ordem.",
  by_store: "O rodízio acontece dentro da unidade do lead; sem unidade, vale a fila geral.",
};

export function TeamSettings({ mode, hasStores }: { mode: string; hasStores: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(mode);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);

    const result = await apiPatch("/api/admin/lead-routing", { mode: next });
    setSaving(false);

    if (!result.ok) {
      setValue(previous);
      toast.error("Não consegui salvar", result.error);
      return;
    }
    toast.success("Distribuição atualizada", HINTS[next]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de leads</CardTitle>
        <CardDescription>
          Quem recebe cada lead que chega pelo site ou pela API. Vale para leads novos; os que já
          existem não mudam de dono sozinhos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormField label="Modo" htmlFor="routing-mode" hint={HINTS[value]} className="mb-0">
          <Select
            id="routing-mode"
            value={value}
            disabled={saving}
            onChange={(event) => void change(event.target.value)}
          >
            {DISTRIBUTION_MODES.filter((item) => item !== "by_store" || hasStores).map((item) => (
              <option key={item} value={item}>
                {DISTRIBUTION_MODE_LABELS[item]}
              </option>
            ))}
          </Select>
        </FormField>
      </CardContent>
    </Card>
  );
}
