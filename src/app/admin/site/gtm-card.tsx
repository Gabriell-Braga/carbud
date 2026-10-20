"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client/api";
import { usePublishConfirm } from "./use-publish-confirm";

/**
 * GTM fica junto do pixel e do GA4: é ali que quem cuida das campanhas
 * procura. Na aba Conteúdo, entre o texto do Sobre e os banners, ninguém achava.
 */
export function GtmCard({ initial, readOnly }: { initial: string; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirmPublish = usePublishConfirm();
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!(await confirmPublish("O código do Google Tag Manager"))) return;
    setBusy(true);
    const result = await apiPatch("/api/admin/site", code ? { gtmCode: code } : { clearGtm: true });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Tag Manager salvo.");
    router.refresh();
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Google Tag Manager</CardTitle>
        <CardDescription>
          {initial
            ? "Este código é injetado no <head> de todas as páginas do seu site."
            : "Sem código próprio, o site usa o GTM configurado pela plataforma."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormField
          label="Código do contêiner"
          htmlFor="gtmCode"
          hint="Formato GTM-XXXXXXX. Deixe vazio para usar o código da plataforma."
        >
          <Input
            id="gtmCode"
            value={code}
            disabled={readOnly}
            onChange={(event) => setCode(event.target.value.toUpperCase().trim())}
            placeholder="GTM-ABC1234"
          />
        </FormField>
        {!readOnly ? (
          <Button type="button" loading={busy} onClick={handleSave}>
            Salvar Tag Manager
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
