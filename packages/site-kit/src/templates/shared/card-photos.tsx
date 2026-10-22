"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { VehiclePhotoView } from "../contract";
import { cn } from "../../lib/format";

/**
 * Fotos do card, compartilhadas pelos templates: arrasta no celular
 * (scroll-snap nativo) e mostra setas no hover, com o contador "n/N".
 *
 * Cada slide é um link para a ficha. As setas não podem ficar dentro de um
 * link (o clique viraria navegação), então o card troca o <Link> em volta da
 * foto por um <div class="group relative">, e o selo por cima ganha
 * pointer-events-none para o clique chegar na foto.
 *
 * O quadro e a imagem recebem as classes do template, para o card continuar
 * idêntico ao de antes.
 */
export function CardPhotos({
  photos,
  cover,
  title,
  href,
  frameClassName,
  imageClassName,
  empty,
}: {
  photos: VehiclePhotoView[];
  cover: string | null;
  title: string;
  href: string;
  frameClassName: string;
  imageClassName: string;
  empty: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // alvo da rolagem em curso: dois cliques seguidos somam, em vez de ler o meio do caminho
  const goal = useRef(0);
  const urls = photos.length ? photos.map((photo) => photo.card || photo.full) : cover ? [cover] : [];

  if (!urls.length) {
    return (
      <Link href={href} className={cn("relative block", frameClassName)}>
        {empty}
      </Link>
    );
  }

  function show(target: number) {
    const el = track.current;
    if (!el) return;
    const next = (target + urls.length) % urls.length;
    goal.current = next;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  // setas só no hover (no toque o arrasto basta); o foco pelo teclado também as mostra
  const arrow =
    "pointer-events-none absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-900 opacity-0 shadow-sm transition hover:scale-105 hover:bg-white focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100";

  return (
    <div className={cn("relative", frameClassName)}>
      <div
        ref={track}
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        onScrollEnd={(event) => {
          const el = event.currentTarget;
          goal.current = Math.round(el.scrollLeft / el.clientWidth);
        }}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {urls.map((url, i) => (
          <Link
            key={url}
            href={href}
            tabIndex={i === 0 ? undefined : -1}
            aria-hidden={i === 0 ? undefined : true}
            className="h-full w-full shrink-0 snap-start overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={i === 0 ? title : ""} loading="lazy" draggable={false} className={imageClassName} />
          </Link>
        ))}
      </div>

      {urls.length > 1 ? (
        <>
          <button type="button" onClick={() => show(goal.current - 1)} aria-label="Foto anterior" className={`${arrow} left-2`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => show(goal.current + 1)} aria-label="Próxima foto" className={`${arrow} right-2`}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
            {index + 1}/{urls.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
