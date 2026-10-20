"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { VehiclePhotoView } from "../contract";
import { cn } from "../../lib/format";

/**
 * Galeria compartilhada entre templates.
 * A interação é a mesma; a aparência vem das classes que o template passa.
 */
export function PhotoGallery({
  photos,
  title,
  tone = "light",
}: {
  photos: VehiclePhotoView[];
  title: string;
  tone?: "light" | "dark";
}) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  /*
   * A fileira de miniaturas só rola na horizontal, coisa que mouse comum não
   * faz: com muitas fotos, as do fim ficavam inalcançáveis ("travadas"). A
   * miniatura ativa é trazida para o meio a cada troca, e a roda do mouse
   * passa a rolar a fileira.
   */
  useEffect(() => {
    const container = strip.current;
    const thumb = container?.children[index] as HTMLElement | undefined;
    if (!container || !thumb) return;
    container.scrollTo({
      left: thumb.offsetLeft - container.clientWidth / 2 + thumb.clientWidth / 2,
      behavior: "smooth",
    });
  }, [index]);

  useEffect(() => {
    const container = strip.current;
    if (!container) return;
    function onWheel(event: WheelEvent) {
      if (!container || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = container.scrollWidth - container.clientWidth;
      // no fim da fileira a roda volta a rolar a página
      if ((event.deltaY < 0 && container.scrollLeft <= 0) || (event.deltaY > 0 && container.scrollLeft >= max)) {
        return;
      }
      event.preventDefault();
      container.scrollLeft += event.deltaY;
    }
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [photos.length]);

  if (photos.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-4/3 w-full items-center justify-center rounded-xl text-sm",
          tone === "dark" ? "bg-white/5 text-white/40" : "bg-black/5 text-black/40",
        )}
      >
        Sem fotos disponíveis
      </div>
    );
  }

  function step(direction: -1 | 1) {
    setIndex((value) => (value + direction + photos.length) % photos.length);
  }

  return (
    <div>
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-black/5">
        {/*
          As fotos ficam TODAS montadas, empilhadas, e o que muda é a opacidade.

          Antes era uma <img> só com o `src` trocado no clique: o navegador
          começava a baixar a foto nova naquele instante, então havia uma espera
          visível e um corte seco no meio. Empilhadas, elas já estão carregadas
          quando a pessoa clica, e a troca é uma transição de opacidade.

          A primeira carrega com prioridade porque é a que aparece; as outras
          ficam para depois, para não disputar banda com ela no primeiro
          desenho da página.
        */}
        {photos.map((photo, photoIndex) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={photo.full}
            alt={photoIndex === index ? title : ""}
            aria-hidden={photoIndex !== index}
            loading={photoIndex === 0 ? "eager" : "lazy"}
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full bg-black/5 object-cover transition-opacity duration-300",
              photoIndex === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}

        {photos.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => step(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => step(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur transition-colors hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
              {index + 1}/{photos.length}
            </span>
          </>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <div ref={strip} className="relative mt-3 flex gap-2 overflow-x-auto scroll-smooth pb-1">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setIndex(photoIndex)}
              aria-label={`Ver foto ${photoIndex + 1}`}
              className={cn(
                "h-16 w-22 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                photoIndex === index
                  ? "border-[var(--site-primary)]"
                  : tone === "dark"
                    ? "border-white/10 opacity-60 hover:opacity-100"
                    : "border-black/10 opacity-60 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
