import Link from "next/link";
import { Logo } from "./logo";

/** Moldura das telas fora do painel: login, recuperação e redefinição. */
export function AuthScreen({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    // mesma escala do painel: o formulário aqui usa os mesmos campos
    <main
      data-density="compact"
      className="flex min-h-screen flex-col bg-bg px-6 py-8 sm:px-10"
    >
      <header>
        <Link href="/login" className="inline-flex">
          <Logo className="h-7" />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[340px]">
          <p className="label-instrument text-accent-text">{eyebrow}</p>
          <h1 className="mt-2 text-[22px] leading-tight text-text">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-8 border-t border-border pt-4">{footer}</div> : null}
        </div>
      </div>

      <footer className="label-instrument text-faint">Plataforma de revendas</footer>
    </main>
  );
}
