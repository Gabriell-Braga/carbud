"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Trash2, Upload } from "lucide-react";
import { TemplatePicker } from "@/components/admin/template-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiUpload } from "@/lib/client/api";
import { ACCEPTED_INPUT, blobFileName, resizeSingle } from "@/lib/client/images";
import { mediaUrl } from "@/lib/paths";
import { openSitePreview } from "@/lib/client/site-preview";
import { usePublishConfirm } from "./use-publish-confirm";

export type IdentityValues = {
  templateId: string;
  logoKey: string | null;
  faviconKey: string | null;
  theme: {
    primary: string;
    primaryForeground: string;
    accent: string;
    surface: string;
    fontHeading: string;
    fontBody: string;
  };
};

const FONT_OPTIONS = [
  { value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", label: "Padrão do sistema" },
  { value: "Georgia, 'Times New Roman', serif", label: "Serifada clássica" },
  { value: "'Trebuchet MS', 'Segoe UI', sans-serif", label: "Trebuchet" },
  { value: "'Courier New', monospace", label: "Monoespaçada" },
  { value: "Impact, 'Arial Black', sans-serif", label: "Impacto (títulos)" },
];

export function IdentityPanel({
  initial,
  slug,
  readOnly,
}: {
  initial: IdentityValues;
  slug: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmPublish = usePublishConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const [templateId, setTemplateId] = useState(initial.templateId);
  const [theme, setTheme] = useState(initial.theme);
  const [logoKey, setLogoKey] = useState(initial.logoKey);
  const [faviconKey, setFaviconKey] = useState(initial.faviconKey);
  const [busy, setBusy] = useState(false);

  function updateTheme(key: keyof IdentityValues["theme"], value: string) {
    setTheme((current) => ({ ...current, [key]: value }));
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    setBusy(true);

    try {
      const blob = await resizeSingle(file, 480);
      const formData = new FormData();
      formData.append("file", blob, blobFileName(blob, "logo"));
      const result = await apiUpload<{ key: string }>("/api/admin/site/logo", formData);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        setLogoKey(result.data.key);
        router.refresh();
      }
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Falha no upload");
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  /*
   * O favicon NAO passa pelo redimensionamento.
   *
   * `resizeSingle` desenha num canvas e devolve raster; um SVG entraria como
   * PNG de tamanho fixo e perderia justamente o que faz dele um bom icone —
   * resolver em qualquer tamanho. Como o arquivo e pequeno por natureza, ele
   * sobe como veio.
   */
  async function handleFavicon(file: File | undefined) {
    if (!file) return;
    setBusy(true);

    const formData = new FormData();
    formData.append("file", file, file.name);
    const result = await apiUpload<{ key: string }>("/api/admin/site/favicon", formData);

    if (!result.ok) {
      toast.error(result.error);
    } else {
      setFaviconKey(result.data.key);
      router.refresh();
    }

    setBusy(false);
    if (faviconRef.current) faviconRef.current.value = "";
  }

  async function handleRemoveFavicon() {
    setBusy(true);
    const result = await apiDelete("/api/admin/site/favicon");
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setFaviconKey(null);
    router.refresh();
  }

  async function handleRemoveLogo() {
    setBusy(true);
    const result = await apiDelete("/api/admin/site/logo");
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLogoKey(null);
    router.refresh();
  }

  async function handleSave() {
    if (!(await confirmPublish("As cores e fontes do site"))) return;

    setBusy(true);

    const result = await apiPatch("/api/admin/site", { templateId, theme });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Identidade salva.");
    router.refresh();
  }

  const logoUrl = mediaUrl(logoKey);
  const faviconUrl = mediaUrl(faviconKey);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Use PNG com fundo transparente. A imagem é reduzida no seu navegador antes do envio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-40 items-center justify-center rounded border border-border bg-surface-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="max-h-16 max-w-36 object-contain" />
              ) : (
                <span className="text-xs text-faint">Sem logo</span>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_INPUT}
              className="hidden"
              disabled={readOnly || busy}
              onChange={(event) => handleLogo(event.target.files?.[0])}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={readOnly || busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Enviar logo
              </Button>
              {logoKey ? (
                <Button
                  type="button"
                  variant="outlineDanger"
                  disabled={readOnly || busy}
                  onClick={handleRemoveLogo}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ícone do site (favicon)</CardTitle>
          <CardDescription>
            É o ícone que aparece na aba do navegador e nos favoritos. Quadrado, a partir de
            48&nbsp;px; SVG e PNG funcionam. Sem ele, a aba mostra o ícone genérico de página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-5">
            {/* fundo xadrez claro: favicon costuma ter fundo transparente */}
            <div className="flex h-20 w-20 items-center justify-center rounded border border-border bg-surface-2">
              {faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faviconUrl} alt="Favicon" className="h-10 w-10 object-contain" />
              ) : (
                <span className="text-center text-xs text-faint">Sem ícone</span>
              )}
            </div>

            <input
              ref={faviconRef}
              type="file"
              accept="image/png,image/webp,image/svg+xml,image/x-icon"
              className="hidden"
              disabled={readOnly || busy}
              onChange={(event) => handleFavicon(event.target.files?.[0])}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={readOnly || busy}
                onClick={() => faviconRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Enviar ícone
              </Button>
              {faviconKey ? (
                <Button
                  type="button"
                  variant="outlineDanger"
                  disabled={readOnly || busy}
                  onClick={handleRemoveFavicon}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cores e fontes</CardTitle>
          <CardDescription>
            As cores viram variáveis CSS no template, então nada fica fixo no código.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["primary", "Cor principal"],
                ["primaryForeground", "Texto sobre a cor principal"],
                ["accent", "Cor de apoio"],
                ["surface", "Fundo dos blocos"],
              ] as const
            ).map(([key, label]) => (
              <FormField key={key} label={label} htmlFor={`theme-${key}`}>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label={label}
                    value={theme[key]}
                    disabled={readOnly}
                    onChange={(event) => updateTheme(key, event.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border border-border bg-surface p-1"
                  />
                  <Input
                    id={`theme-${key}`}
                    value={theme[key]}
                    disabled={readOnly}
                    onChange={(event) => updateTheme(key, event.target.value)}
                  />
                </div>
              </FormField>
            ))}
          </div>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField label="Fonte dos títulos" htmlFor="fontHeading">
              <Select
                id="fontHeading"
                value={theme.fontHeading}
                disabled={readOnly}
                onChange={(event) => updateTheme("fontHeading", event.target.value)}
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Fonte dos textos" htmlFor="fontBody">
              <Select
                id="fontBody"
                value={theme.fontBody}
                disabled={readOnly}
                onChange={(event) => updateTheme("fontBody", event.target.value)}
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div
            className="rounded border border-border p-4"
            style={{ backgroundColor: theme.surface }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: theme.primary, fontFamily: theme.fontHeading }}
            >
              Prévia do título
            </p>
            <p className="mt-1 text-xs text-muted" style={{ fontFamily: theme.fontBody }}>
              Assim ficam os textos do seu site.
            </p>
            <span
              className="mt-3 inline-block rounded px-4 py-2 text-xs font-medium"
              style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
            >
              Botão de ação
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template do site</CardTitle>
          <CardDescription>
            Trocar o template muda só a aparência. Estoque, fotos e leads continuam intactos. Use
            &quot;Ver prévia&quot; para navegar pelo seu site com o template e as cores acima antes
            de publicar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplatePicker
            value={templateId}
            disabled={readOnly}
            onChange={(value) => {
              setTemplateId(value);
            }}
            onPreview={(value) => openSitePreview(slug, { templateId: value, theme })}
          />
        </CardContent>
      </Card>


      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => openSitePreview(slug, { templateId, theme })}
        >
          <Eye className="h-3.5 w-3.5" />
          Ver prévia
        </Button>
        {!readOnly ? (
          <Button type="button" loading={busy} onClick={handleSave}>
            Salvar identidade
          </Button>
        ) : null}
      </div>
    </div>
  );
}
