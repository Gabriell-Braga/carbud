import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { Logo } from "@/components/layout/logo";
import { InstrumentPanel } from "./instrument-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  tenant: "Não foi possível carregar sua revenda. Fale com o suporte.",
  sessao: "Sua sessão expirou. Entre novamente.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const params = await searchParams;
  const message = params.erro ? ERROR_MESSAGES[params.erro] : null;

  const cookieValue = (await cookies()).get(THEME_COOKIE)?.value;
  const preference: ThemePreference = isThemePreference(cookieValue)
    ? cookieValue
    : DEFAULT_THEME_PREFERENCE;

  return (
    <main className="grid min-h-screen bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ------------------------------------------------ formulário */}
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <Logo className="h-6 lg:invisible" />
          <ThemeToggle current={preference} />
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[340px]">
            <p className="label-instrument text-accent-text">Acesso restrito</p>
            <h1 className="mt-2 text-[22px] leading-tight text-text">Entrar no painel</h1>
            <p className="mt-1.5 text-[13px] text-muted">
              Estoque, leads e site da sua revenda em um lugar só.
            </p>

            {message ? (
              <div className="mt-5">
                <Alert tone="warning">{message}</Alert>
              </div>
            ) : null}

            <div className="mt-7">
              <LoginForm next={params.next} />
            </div>

            <div className="mt-8 border-t border-border pt-4">
              <Link
                href="/esqueci-senha"
                className="text-[13px] text-accent-text hover:underline"
              >
                Esqueci minha senha
              </Link>
              <p className="mt-2 text-xs text-faint">
                Sem acesso? Fale com o administrador da sua revenda.
              </p>
            </div>
          </div>
        </div>

        <footer className="label-instrument text-faint">Plataforma de revendas</footer>
      </div>

      {/* ------------------------------------------------ painel visual */}
      <aside
        data-theme-transition
        className="relative hidden overflow-hidden border-l border-border bg-surface lg:block"
      >
        {/* Posicionado em porcentagem, não em pixel: assim o arco começa depois
            da coluna de texto em qualquer largura de tela. Antes ele era fixo em
            -32 e invadia o título em telas menores. */}
        <InstrumentPanel className="absolute left-[38%] top-1/2 aspect-square w-[115%] -translate-y-1/2 opacity-75" />

        {/* Véu suave só para as marcações que ainda alcançam a área de leitura.
            Parte de --surface, então vale nos dois temas. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-r from-surface via-surface/55 via-40% to-transparent to-72%"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-surface via-surface/60 to-transparent"
        />

        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo className="h-8" />

          <div className="max-w-md">
            <p className="label-instrument text-accent-text">Cockpit</p>
            <p className="mt-3 font-display text-[28px] font-semibold leading-[1.12] tracking-tight text-text">
              O painel de quem vende carro.
            </p>
            <p className="mt-3.5 max-w-sm text-sm leading-relaxed text-muted">
              Estoque, fotos, leads e o site da revenda no mesmo lugar, feito para uso diário, não
              para demonstração.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-6 border-t border-border pt-6">
            {[
              { label: "Estoque", value: "Ilimitado" },
              { label: "Site próprio", value: "Incluso" },
              { label: "Leads", value: "Centralizados" },
            ].map((item) => (
              <div key={item.label}>
                <dt className="label-instrument text-muted">{item.label}</dt>
                <dd className="mt-1 font-display text-sm font-medium text-text">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
