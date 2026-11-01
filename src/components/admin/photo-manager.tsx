"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiUpload } from "@/lib/client/api";
import { ACCEPTED_INPUT, buildPhotoFormData, generateVariants } from "@/lib/client/images";
import { mediaUrl } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export type PhotoItem = {
  id: string;
  variants: { thumb: string; card: string; full: string };
  isCover: boolean;
  position: number;
};

const MAX_PHOTOS = 40;

export function PhotoManager({
  vehicleId: fixedId,
  photos,
  disabled,
  resolveVehicleId,
  onPhotosChange,
}: {
  /** Já existe: tela de edição. */
  vehicleId?: string;
  photos: PhotoItem[];
  disabled?: boolean;
  /**
   * Cadastro novo: o veículo ainda não existe quando a pessoa escolhe a
   * primeira foto. Chamado uma vez, no primeiro envio, para abrir o rascunho
   * que vai receber as imagens.
   */
  resolveVehicleId?: () => Promise<string | null>;
  onPhotosChange?: (count: number) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PhotoItem[]>(photos);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [resolvedId, setResolvedId] = useState<string | null>(fixedId ?? null);

  const vehicleId: string | null = fixedId ?? resolvedId;

  function replaceItems(next: PhotoItem[]) {
    setItems(next);
    onPhotosChange?.(next.length);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setBusy(true);

    // no cadastro novo o veículo nasce aqui, no primeiro envio — não ao abrir
    // a tela, senão quem só espia o formulário deixa rascunho para trás
    let targetId: string | null = vehicleId;
    if (!targetId && resolveVehicleId) {
      targetId = await resolveVehicleId();
      if (targetId) setResolvedId(targetId);
    }
    if (!targetId) {
      setBusy(false);
      toast.error("Não consegui preparar o envio das fotos. Tente de novo.");
      return;
    }

    setProgress({ done: 0, total: files.length });

    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      try {
        const variants = await generateVariants(file);
        const result = await apiUpload<{ photos: PhotoItem[] }>(
          `/api/admin/vehicles/${targetId}/photos`,
          buildPhotoFormData(variants),
        );

        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`);
          break;
        }
        replaceItems(result.data.photos);
        uploaded += 1;
      } catch (uploadError) {
        toast.error(
          uploadError instanceof Error
            ? `${file.name}: ${uploadError.message}`
            : `Falha ao processar ${file.name}`,
        );
        break;
      }
      setProgress({ done: index + 1, total: files.length });
    }

    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "Foto enviada." : `${uploaded} fotos enviadas.`);
      router.refresh();
    }
  }

  /* a capa é a primeira foto, então a marca acompanha a ordem sem esperar o
     servidor responder — senão o selo fica numa foto e a capa real em outra */
  function withCover(list: PhotoItem[]): PhotoItem[] {
    return list.map((photo, index) => ({ ...photo, isCover: index === 0 }));
  }

  async function persistOrder(next: PhotoItem[]) {
    if (!vehicleId) return;
    const previous = items;
    setItems(withCover(next));
    setBusy(true);

    const result = await apiPatch(`/api/admin/vehicles/${vehicleId}/photos`, {
      photoIds: next.map((photo) => photo.id),
    });

    setBusy(false);
    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
  }

  async function handleCover(photoId: string) {
    if (!vehicleId) return;
    const previous = items;
    // definir a capa MOVE a foto para a frente, como o servidor faz
    const escolhida = items.find((photo) => photo.id === photoId);
    if (!escolhida) return;
    setItems(withCover([escolhida, ...items.filter((photo) => photo.id !== photoId)]));
    setBusy(true);

    const result = await apiPatch(`/api/admin/vehicles/${vehicleId}/photos`, { photoId });
    setBusy(false);

    if (!result.ok) {
      setItems(previous);
      toast.error(result.error);
      return;
    }
    toast.success("Capa definida.");
    router.refresh();
  }

  async function handleDelete(photoId: string) {
    const confirmed = await confirm({
      title: "Remover foto",
      description: "A imagem é apagada e não dá para recuperar.",
      confirmLabel: "Remover foto",
      tone: "danger",
    });
    if (!confirmed || !vehicleId) return;

    setBusy(true);
    const result = await apiDelete(`/api/admin/vehicles/${vehicleId}/photos/${photoId}`);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    replaceItems(items.filter((photo) => photo.id !== photoId));
    toast.success("Foto removida.");
    router.refresh();
  }

  const iconButton =
    "grid h-6 w-6 place-items-center rounded-sm text-muted transition-colors hover:bg-surface-3 hover:text-text disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotos</CardTitle>
        <CardDescription>A primeira foto é a capa.</CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_INPUT}
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
          disabled={disabled || busy}
        />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || items.length >= MAX_PHOTOS}
            loading={busy && progress !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Adicionar fotos
          </Button>
          {progress ? (
            <span aria-live="polite" className="text-[13px] text-muted">
              Enviando {Math.min(progress.done + 1, progress.total)} de {progress.total}…
            </span>
          ) : null}
          <span className="label-instrument tnum text-faint">
            {items.length} / {MAX_PHOTOS}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="rounded border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted">
            Nenhuma foto ainda. Anúncio com foto recebe muito mais contato.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((photo, index) => (
              <div
                key={photo.id}
                className={cn(
                  "overflow-hidden rounded border bg-surface-2",
                  photo.isCover ? "border-accent" : "border-border",
                )}
              >
                <div className="relative aspect-4/3 w-full bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(photo.variants.thumb) ?? ""}
                    alt={`Foto ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                  {photo.isCover ? (
                    <span className="label-instrument absolute left-1.5 top-1.5 rounded-sm bg-accent px-1.5 py-0.5 text-accent-contrast">
                      Capa
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-1 border-t border-border bg-surface px-1.5 py-1">
                  <div className="flex gap-0.5">
                    <Tooltip content={"Mover para a esquerda"}>
                      <button
                        type="button"
                        aria-label="Mover para a esquerda"
                        className={iconButton}
                        disabled={disabled || busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content={"Mover para a direita"}>
                      <button
                        type="button"
                        aria-label="Mover para a direita"
                        className={iconButton}
                        disabled={disabled || busy || index === items.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                  <div className="flex gap-0.5">
                    <Tooltip content={"Definir como capa"}>
                      <button
                        type="button"
                        aria-label="Definir como capa"
                        className={cn(iconButton, photo.isCover && "text-accent")}
                        disabled={disabled || busy || photo.isCover}
                        onClick={() => handleCover(photo.id)}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content={"Remover foto"}>
                      <button
                        type="button"
                        aria-label="Remover foto"
                        className={cn(iconButton, "hover:text-danger")}
                        disabled={disabled || busy}
                        onClick={() => handleDelete(photo.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
