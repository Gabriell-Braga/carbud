"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "../../lib/client-api";
import { DEFAULT_WHATSAPP_FORM_FIELDS, type WhatsappFormField } from "../../lib/catalog";
import { maskPhone } from "../../lib/masks";
import { readUtm } from "./utm";
import { newBrowserEventId, readTrackingContext, trackBrowserEvent } from "./tracking";
import { WhatsappIcon } from "./whatsapp-icon";

/**
 * Formulário antes do WhatsApp, quando a revenda liga a opção.
 *
 * Os botões de WhatsApp continuam sendo links `wa.me` comuns em todos os
 * templates; este componente, montado uma vez no layout, intercepta o clique
 * em qualquer um deles. Assim nenhum dos vinte e tantos botões precisa saber
 * da regra, e um botão novo num template novo entra nela sem lembrar de nada.
 *
 * Quem já preencheu uma vez segue direto nas próximas: pedir nome e telefone
 * a cada clique faria a pessoa desistir do contato que a loja queria.
 */
export function WhatsappGate({
  tenantSlug,
  enabled,
  fields = DEFAULT_WHATSAPP_FORM_FIELDS,
}: {
  tenantSlug: string;
  enabled: boolean;
  /** Campos escolhidos pela revenda, além do telefone, que é sempre pedido. */
  fields?: WhatsappFormField[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const eventId = useRef("");
  const [target, setTarget] = useState<{ href: string; vehicleId: string; text: string } | null>(
    null,
  );
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `carbud:wa-lead:${tenantSlug}`;

  useEffect(() => {
    if (!enabled) return;

    function handleClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor?.href.startsWith("https://wa.me/")) return;
      if (alreadyIdentified(storageKey)) return;

      event.preventDefault();
      eventId.current = newBrowserEventId();
      setError(null);
      setTarget({
        href: anchor.href,
        vehicleId: anchor.dataset.vehicleId ?? "",
        text: new URL(anchor.href).searchParams.get("text") ?? "",
      });
      dialogRef.current?.showModal();
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [enabled, storageKey]);

  if (!enabled) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;

    /*
     * A aba nasce AGORA, ainda dentro do clique: aberta depois do `await`, o
     * navegador a trata como pop-up e bloqueia. Ela recebe o endereço do
     * WhatsApp quando o lead estiver salvo.
     */
    const tab = window.open("", "_blank");
    setSending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? "").trim();
    // o lead exige nome; sem o campo, o vendedor vê de onde veio
    const name = fields.includes("name") ? read("name") : "Contato pelo WhatsApp";
    const message = [
      target.text,
      read("message") && `O que procura: ${read("message")}`,
      read("tradeIn") && `Carro para a troca: ${read("tradeIn")}`,
    ]
      .filter(Boolean)
      .join("\n");
    const result = await apiPost("/api/leads", {
      tenantSlug,
      kind: "whatsapp",
      vehicleId: target.vehicleId,
      name,
      phone,
      email: read("email"),
      message,
      website: String(form.get("website") ?? ""),
      utm: readUtm(),
      tracking: readTrackingContext(eventId.current),
    });
    setSending(false);

    if (!result.ok) {
      tab?.close();
      setError(result.error);
      return;
    }

    trackBrowserEvent("generate_lead", {
      eventId: eventId.current,
      itemId: target.vehicleId || null,
    });
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // navegação privada: a pessoa só vai preencher de novo no próximo clique
    }

    if (tab) tab.location.href = target.href;
    else window.location.href = target.href;
    dialogRef.current?.close();
  }

  // o primeiro campo não precisa do respiro de cima
  const label = "mb-1 mt-3 block text-xs font-medium text-slate-500 first-of-type:mt-0";
  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[var(--site-primary)]";

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setTarget(null)}
      className="m-auto w-[calc(100%-32px)] max-w-sm rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50"
    >
      <form onSubmit={handleSubmit} className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">Falar no WhatsApp</p>
            <p className="mt-1 text-sm text-slate-500">
              Deixe seus dados para a loja te atender.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-md px-2 text-xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        {fields.includes("name") ? (
          <>
            <label className={label} htmlFor="wa-name">
              Nome
            </label>
            <input id="wa-name" name="name" required minLength={2} autoComplete="name" className={field} />
          </>
        ) : null}

        <label className={label} htmlFor="wa-phone">
          Telefone / WhatsApp
        </label>
        <input
          id="wa-phone"
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-8888"
          className={field}
          value={phone}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />

        {fields.includes("email") ? (
          <>
            <label className={label} htmlFor="wa-email">
              E-mail
            </label>
            <input id="wa-email" name="email" type="email" required autoComplete="email" className={field} />
          </>
        ) : null}

        {fields.includes("message") ? (
          <>
            <label className={label} htmlFor="wa-message">
              O que você procura? <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input id="wa-message" name="message" maxLength={300} className={field} />
          </>
        ) : null}

        {fields.includes("tradeIn") ? (
          <>
            <label className={label} htmlFor="wa-trade">
              Tem carro para dar na troca? <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id="wa-trade"
              name="tradeIn"
              maxLength={120}
              placeholder="Modelo e ano, ex.: Gol 2018"
              className={field}
            />
          </>
        ) : null}

        {/* honeypot anti-spam: invisível para pessoas */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={sending}
          style={{ backgroundColor: "var(--site-whatsapp)" }}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          <WhatsappIcon />
          {sending ? "Enviando..." : "Continuar para o WhatsApp"}
        </button>

        <p className="mt-2 text-center text-[11px] text-slate-400">
          Seus dados são usados apenas para este atendimento.
        </p>
      </form>
    </dialog>
  );
}

function alreadyIdentified(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
