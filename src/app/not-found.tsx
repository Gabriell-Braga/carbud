import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md text-center">
        <p className="text-[13px] font-semibold tracking-wide text-text">{APP_NAME}</p>
        <p className="mt-8 text-[72px] font-semibold leading-none tracking-tight text-accent-text tabular-nums">
          404
        </p>
        <h1 className="mt-4 text-[20px] leading-tight text-text">Página não encontrada</h1>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-muted">
          O endereço pode estar errado ou o conteúdo foi removido. Se você chegou aqui por um link
          do painel, avise o suporte.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/admin">
            <Button type="button">Ir para o painel</Button>
          </Link>
          <Link href="/">
            <Button type="button" variant="secondary">
              Página inicial
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
