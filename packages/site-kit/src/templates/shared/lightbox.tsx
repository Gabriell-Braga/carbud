"use client";

import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/*
 * Mesmo arquivo no portal (src/components/lightbox.tsx) e no site-kit das
 * revendas (templates/shared/lightbox.tsx): só depende de React e
 * lucide-react, então uma correção é copiar o arquivo de um lado para o outro.
 */

const MAX_SCALE = 4;
const TAP_ZOOM = 2.5;

type View = { scale: number; x: number; y: number };
const RESET: View = { scale: 1, x: 0, y: 0 };
type Point = { x: number; y: number };
type Gesture = { start: View; at: Point; distance?: number; moved: boolean };

/**
 * Foto em tela cheia, com zoom: pinça e arrasto no celular, roda do mouse,
 * duplo clique ou toque, botões e teclado (setas, + e −, Esc). Sem zoom, o
 * arrasto lateral troca de foto. O zoom é um transform na própria imagem; a
 * página por trás para de rolar enquanto a foto está aberta.
 */
export function Lightbox({
  photos,
  start,
  title,
  onClose,
}: {
  photos: string[];
  start: number;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [view, setViewState] = useState<View>(RESET);
  const [swipe, setSwipe] = useState(0);
  const [touching, setTouching] = useState(false);
  // os handlers de ponteiro leem o valor da hora, não o da última renderização
  const current = useRef<View>(RESET);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);

  function setView(next: View) {
    current.current = next;
    setViewState(next);
  }

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      el?.close();
    };
  }, []);

  // a vizinha já baixada: trocar de foto não mostra tela vazia
  useEffect(() => {
    for (const step of [-1, 1]) {
      const url = photos[(index + step + photos.length) % photos.length];
      if (url) new Image().src = url;
    }
  }, [index, photos]);

  function go(step: number) {
    setIndex((value) => (value + step + photos.length) % photos.length);
    setView(RESET);
  }

  /** Limita o arrasto à área da foto ampliada; sem zoom, volta ao centro. */
  function clamp(next: View): View {
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    const el = stage.current;
    if (!el || scale === 1) return RESET;
    const maxX = (el.clientWidth * (scale - 1)) / 2;
    const maxY = (el.clientHeight * (scale - 1)) / 2;
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  /** Ponto da tela relativo ao centro do palco, onde o transform tem origem. */
  function fromCenter(point: Point): Point {
    const rect = stage.current!.getBoundingClientRect();
    return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 };
  }

  /** Muda a escala mantendo parado o ponto sob o dedo ou o cursor. */
  function zoomAround(base: View, point: Point, scale: number, pan: Point = { x: 0, y: 0 }): View {
    const target = Math.min(MAX_SCALE, Math.max(1, scale));
    const p = fromCenter(point);
    const k = target / base.scale;
    return clamp({ scale: target, x: p.x - (p.x - base.x) * k + pan.x, y: p.y - (p.y - base.y) * k + pan.y });
  }

  function zoomBy(factor: number) {
    const rect = stage.current!.getBoundingClientRect();
    setView(zoomAround(current.current, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, current.current.scale * factor));
  }

  function begin() {
    const list = [...pointers.current.values()];
    if (list.length >= 2) {
      const [a, b] = list;
      gesture.current = {
        start: current.current,
        at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        moved: true,
      };
    } else if (list.length === 1) {
      gesture.current = { start: current.current, at: list[0], moved: false };
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setTouching(true);
    begin();
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    const list = [...pointers.current.values()];

    if (list.length >= 2 && g.distance) {
      const [a, b] = list;
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = (g.start.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance;
      setView(zoomAround(g.start, g.at, scale, { x: middle.x - g.at.x, y: middle.y - g.at.y }));
      return;
    }

    const dx = event.clientX - g.at.x;
    const dy = event.clientY - g.at.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (g.start.scale > 1) setView(clamp({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }));
    else setSwipe(dx);
  }

  function onPointerUp(event: React.PointerEvent) {
    if (!pointers.current.delete(event.pointerId)) return;
    const g = gesture.current;

    // tirou um dos dois dedos: o que ficou continua arrastando dali
    if (pointers.current.size > 0) return begin();
    gesture.current = null;
    setTouching(false);

    if (swipe && Math.abs(swipe) > 60 && photos.length > 1) go(swipe < 0 ? 1 : -1);
    setSwipe(0);
    if (!g || g.moved || event.type === "pointercancel") return;

    // toque parado: dois seguidos alternam o zoom no ponto tocado
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setView(current.current.scale > 1 ? RESET : zoomAround(current.current, { x: event.clientX, y: event.clientY }, TAP_ZOOM));
    } else {
      lastTap.current = now;
    }
  }

  const button = "grid size-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40";

  return (
    <dialog
      ref={dialog}
      aria-label={`Fotos de ${title}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(-1);
        else if (event.key === "ArrowRight") go(1);
        else if (event.key === "+" || event.key === "=") zoomBy(1.5);
        else if (event.key === "-") zoomBy(1 / 1.5);
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold tabular-nums">{index + 1}/{photos.length}</span>
            <span className="ml-3 text-white/70">{title}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={view.scale <= 1} aria-label="Diminuir zoom" className={button}>
              <ZoomOut className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => zoomBy(1.5)} disabled={view.scale >= MAX_SCALE} aria-label="Aumentar zoom" className={button}>
              <ZoomIn className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={onClose} aria-label="Fechar" autoFocus className={button}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          ref={stage}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => setView(zoomAround(current.current, { x: event.clientX, y: event.clientY }, current.current.scale * Math.exp(-event.deltaY * 0.0015)))}
          className={`relative min-h-0 flex-1 touch-none overflow-hidden select-none ${view.scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={index}
            src={photos[index]}
            alt={`${title}, foto ${index + 1} de ${photos.length}`}
            draggable={false}
            style={{
              transform: `translate(${view.x + swipe}px, ${view.y}px) scale(${view.scale})`,
              transition: touching ? "none" : "transform 200ms ease-out",
            }}
            className="h-full w-full object-contain"
          />

          {photos.length > 1 && view.scale === 1 && (
            <>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => go(-1)} aria-label="Foto anterior" className={`${button} absolute top-1/2 left-3 -translate-y-1/2 bg-black/50`}>
                <ChevronLeft className="size-6" aria-hidden="true" />
              </button>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => go(1)} aria-label="Próxima foto" className={`${button} absolute top-1/2 right-3 -translate-y-1/2 bg-black/50`}>
                <ChevronRight className="size-6" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
