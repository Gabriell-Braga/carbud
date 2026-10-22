"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input, Textarea } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiUpload } from "@/lib/client/api";
import { ACCEPTED_INPUT, blobFileName, resizeSingle } from "@/lib/client/images";
import { mediaUrl } from "@/lib/paths";
import { usePublishConfirm } from "./use-publish-confirm";

export type BannerItem = {
  id: string;
  imageKey: string;
  active: boolean;
};

/*
 * Onde cada imagem ativa aparece, pela ordem.
 *
 * Os templates não têm "banner" com texto e botão: usam as imagens ativas por
 * posição — a 1ª no destaque da home e no Sobre nós, a 2ª mais abaixo. A tela
 * antes pedia título, subtítulo e botão que nenhum template mostrava, e a
 * revenda descobria a foto do Sobre nós só abrindo o site.
 */
const SLOT_USES: Record<string, string[]> = {
  showroom: ["Topo da home, do estoque e do Sobre nós", "Meio da home e segunda foto do Sobre nós"],
};
const DEFAULT_SLOT_USES = ["Destaque da home e foto do Sobre nós", "Segunda foto do Sobre nós"];

export type ContentValues = {
  aboutTitle: string;
  aboutText: string;
};

export function ContentPanel({
  initial,
  banners,
  templateId,
  readOnly,
}: {
  initial: ContentValues;
  banners: BannerItem[];
  templateId: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmPublish = usePublishConfirm();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof ContentValues>(key: K, value: ContentValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!(await confirmPublish("Os textos do site"))) return;

    setBusy(true);

    const result = await apiPatch("/api/admin/site", {
      aboutTitle: values.aboutTitle,
      aboutText: values.aboutText,
    });

    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Conteúdo salvo.");
    router.refresh();
  }

  async function handleBannerUpload(file: File | undefined) {
    if (!file) return;
    setBusy(true);

    try {
      const blob = await resizeSingle(file, 1920, 0.82);
      const formData = new FormData();
      formData.append("file", blob, blobFileName(blob, "banner"));
      const result = await apiUpload("/api/admin/site/banners", formData);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success("Imagem adicionada.");
        router.refresh();
      }
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Falha no upload");
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function patchBanner(id: string, payload: Record<string, unknown>) {
    setBusy(true);
    const result = await apiPatch(`/api/admin/site/banners/${id}`, payload);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function moveBanner(index: number, offset: -1 | 1) {
    const order = banners.map((banner) => banner.id);
    [order[index], order[index + offset]] = [order[index + offset], order[index]];
    setBusy(true);
    // reescreve todas as posições: as antigas podem estar repetidas
    for (const [position, id] of order.entries()) {
      const result = await apiPatch(`/api/admin/site/banners/${id}`, { position });
      if (!result.ok) {
        toast.error(result.error);
        break;
      }
    }
    setBusy(false);
    router.refresh();
  }

  function slotUse(id: string): string {
    const slot = banners.filter((banner) => banner.active).findIndex((banner) => banner.id === id);
    if (slot < 0) return "Inativa: não aparece no site";
    return (SLOT_USES[templateId] ?? DEFAULT_SLOT_USES)[slot] ?? "Não aparece no template atual";
  }

  async function deleteBanner(id: string) {
    const confirmed = await confirm({
      title: "Remover imagem",
      description: "Ele sai do site na hora e a imagem é apagada.",
      confirmLabel: "Remover imagem",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    const result = await apiDelete(`/api/admin/site/banners/${id}`);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Sobre a revenda</CardTitle>
          <CardDescription>
            Este texto aparece na home e na página de contato do seu site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Título" htmlFor="aboutTitle">
            <Input
              id="aboutTitle"
              value={values.aboutTitle}
              disabled={readOnly}
              onChange={(event) => update("aboutTitle", event.target.value)}
              placeholder="Sobre nós"
            />
          </FormField>
          <FormField label="Texto" htmlFor="aboutText" className="mb-0">
            <Textarea
              id="aboutText"
              rows={6}
              value={values.aboutText}
              disabled={readOnly}
              onChange={(event) => update("aboutText", event.target.value)}
              placeholder="Há 15 anos no mercado, trabalhamos com seminovos revisados e com garantia..."
            />
          </FormField>
        </CardContent>
      </Card>

      {!readOnly ? (
        <Button type="button" loading={busy} onClick={handleSave}>
          Salvar conteúdo
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Imagens do site</CardTitle>
          <CardDescription>
            O template usa as imagens ativas na ordem abaixo. Cada uma diz onde aparece; use as
            setas para trocar a ordem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_INPUT}
            className="hidden"
            disabled={readOnly || busy}
            onChange={(event) => handleBannerUpload(event.target.files?.[0])}
          />

          {!readOnly ? (
            <Button
              type="button"
              variant="secondary"
              className="mb-4"
              loading={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Adicionar imagem
            </Button>
          ) : null}

          {banners.length === 0 ? (
            <p className="rounded border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
              Nenhuma imagem cadastrada. Sem ela, a home usa um destaque padrão com o nome da
              revenda e o Sobre nós fica sem foto.
            </p>
          ) : (
            <div className="space-y-3">
              {banners.map((banner, index) => (
                <div
                  key={banner.id}
                  className="flex flex-col gap-3 rounded border border-border p-3 sm:flex-row sm:items-center"
                >
                  <div className="aspect-video w-full shrink-0 overflow-hidden rounded bg-surface-2 sm:w-48">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(banner.imageKey) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{index + 1}ª imagem</p>
                    <p className="text-xs text-muted">{slotUse(banner.id)}</p>
                    <label className="mt-2 flex items-center gap-2 text-[13px] text-muted">
                      <Checkbox
                        checked={banner.active}
                        disabled={readOnly || busy}
                        onChange={(event) =>
                          patchBanner(banner.id, { active: event.target.checked })
                        }
                      />
                      Ativa
                    </label>
                  </div>

                  {!readOnly ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label="Subir"
                        disabled={busy || index === 0}
                        onClick={() => moveBanner(index, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label="Descer"
                        disabled={busy || index === banners.length - 1}
                        onClick={() => moveBanner(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outlineDanger"
                        loading={busy}
                        onClick={() => deleteBanner(banner.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
