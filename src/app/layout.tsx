import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ToastProvider } from "@/components/ui/toast";
import { APP_DESCRIPTION, APP_NAME, APP_TITLE_TEMPLATE } from "@/lib/brand";
import { BASE_PATH } from "@/lib/paths";
import { THEME_COOKIE, isThemePreference, themeClassName } from "@/lib/theme";

/**
 * Montserrat em toda a interface.
 *
 * Apenas os quatro pesos que o sistema usa: o documento pede no máximo três
 * pesos por tela, e carregar o que não se usa custa banda sem devolver nada.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // lido no servidor: a página já chega pintada no tema certo, sem FOUC
  const preference = (await cookies()).get(THEME_COOKIE)?.value;
  const themeClass = isThemePreference(preference) ? themeClassName(preference) : "";

  // O mount path pode só existir no runtime do Worker; publicamos no <html>
  // para o cliente montar URLs de fetch e de imagem sem depender do build.
  // `||`, não `??`: no Worker o BASE_URL existe e vem vazio, e o `??` parava nele
  const basePath = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_PATH || BASE_PATH;

  return (
    <html
      lang="pt-BR"
      className={`${themeClass} ${montserrat.variable}`.trim()}
      data-base-path={basePath || undefined}
      suppressHydrationWarning
    >
      <body>
        {/* Avisos vivem no layout raiz: login, recuperação de senha e site
            público também precisam falar com quem está na tela. */}
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
