"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
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
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  active: boolean;
};

export type ContentValues = {
  aboutTitle: string;
  aboutText: string;
};

export function ContentPanel({
  initial,
  banners,
  readOnly,
}: {
  initial: ContentValues;
  banners: BannerItem[];
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
        toast.success("Banner adicionado.");
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

  async function deleteBanner(id: string) {
    const confirmed = await confirm({
      title: "Remover banner",
      description: "Ele sai do site na hora e a imagem é apagada.",
      confirmLabel: "Remover banner",
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
          <CardTitle>Banners da home</CardTitle>
          <CardDescription>
            O primeiro banner ativo vira o destaque principal da home.
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
              Adicionar banner
            </Button>
          ) : null}

          {banners.length === 0 ? (
            <p className="rounded border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
              Nenhum banner cadastrado. Sem banner, a home usa um destaque padrão com o nome da
              revenda.
            </p>
          ) : (
            <div className="space-y-4">
              {banners.map((banner) => (
                <div key={banner.id} className="rounded border border-border p-4">
                  <div className="mb-3 h-28 w-full overflow-hidden rounded bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(banner.imageKey) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <FormField label="Título" htmlFor={`banner-title-${banner.id}`}>
                      <Input
                        id={`banner-title-${banner.id}`}
                        defaultValue={banner.title ?? ""}
                        disabled={readOnly}
                        onBlur={(event) => patchBanner(banner.id, { title: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Subtítulo" htmlFor={`banner-subtitle-${banner.id}`}>
                      <Input
                        id={`banner-subtitle-${banner.id}`}
                        defaultValue={banner.subtitle ?? ""}
                        disabled={readOnly}
                        onBlur={(event) => patchBanner(banner.id, { subtitle: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Texto do botão" htmlFor={`banner-cta-${banner.id}`}>
                      <Input
                        id={`banner-cta-${banner.id}`}
                        defaultValue={banner.ctaLabel ?? ""}
                        disabled={readOnly}
                        onBlur={(event) => patchBanner(banner.id, { ctaLabel: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Link do botão" htmlFor={`banner-href-${banner.id}`}>
                      <Input
                        id={`banner-href-${banner.id}`}
                        defaultValue={banner.ctaHref ?? ""}
                        disabled={readOnly}
                        onBlur={(event) => patchBanner(banner.id, { ctaHref: event.target.value })}
                      />
                    </FormField>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[13px] text-muted">
                      <Checkbox
                        checked={banner.active}
                        disabled={readOnly || busy}
                        onChange={(event) =>
                          patchBanner(banner.id, { active: event.target.checked })
                        }
                      />
                      Ativo
                    </label>
                    {!readOnly ? (
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
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
