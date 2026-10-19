"use client";

import { clearSitePreview } from "@/lib/client/site-preview";

/*
 * Faixa fixa no rodapé, por cima do template: sem ela, a pessoa fecha a aba
 * achando que o site já mudou — ou abre o endereço depois e se assusta com
 * uma aparência que nunca publicou.
 */
export function PreviewBar({ templateName }: { templateName: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] flex flex-wrap items-center justify-center gap-3 bg-black/90 px-4 py-3 text-center text-sm text-white">
      <span>
        Prévia{templateName ? ` do template ${templateName}` : ""}. Nada foi publicado: volte ao
        painel e salve para valer.
      </span>
      <button
        type="button"
        className="rounded border border-white/40 px-3 py-1 text-xs font-medium hover:bg-white/10"
        onClick={() => {
          clearSitePreview();
          // a aba foi aberta pelo painel; se o navegador não deixar fechar, mostra o site salvo
          window.close();
          window.location.reload();
        }}
      >
        Fechar prévia
      </button>
    </div>
  );
}
