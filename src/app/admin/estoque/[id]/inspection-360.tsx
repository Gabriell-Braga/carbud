"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { FormField, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiUpload } from "@/lib/client/api";
import { ACCEPTED_INPUT, blobFileName, resizeSingle } from "@/lib/client/images";
import { SPIN_MAX_FRAMES, SPIN_MIN_FRAMES } from "@/lib/catalog/media360";

export type InspectionValues = {
  provider: string;
  date: string;
  result: "approved" | "approved_with_notes" | "rejected";
  reportUrl: string;
  /** Vale selo no site e no portal (aprovado e com menos de um ano). */
  valid: boolean;
} | null;

const RESULTS = [
  { value: "approved", label: "Aprovado" },
  { value: "approved_with_notes", label: "Aprovado com ressalvas" },
  { value: "rejected", label: "Reprovado" },
] as const;

export function InspectionCard({
  vehicleId,
  initial,
  readOnly,
}: {
  vehicleId: string;
  initial: InspectionValues;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!fileRef.current?.files?.[0]) {
      toast.error("Anexe o laudo em PDF.");
      return;
    }
    setBusy(true);
    const result = await apiUpload(`/api/admin/vehicles/${vehicleId}/inspection`, new FormData(form));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Vistoria salva.");
    form.reset();
    router.refresh();
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remover vistoria",
      description: "O laudo é apagado e o selo de vistoriado sai do site e do portal.",
      confirmLabel: "Remover vistoria",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const result = await apiDelete(`/api/admin/vehicles/${vehicleId}/inspection`);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vistoria</CardTitle>
        <CardDescription>
          Com o laudo em PDF anexado, aprovado e com menos de um ano, o carro ganha o selo
          &quot;Vistoriado&quot; no site e no Portal Carbud, com link para o laudo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {initial ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-border p-3 text-[13px]">
            <FileText className="h-4 w-4 text-muted" />
            <span className="font-medium">{initial.provider}</span>
            <span className="text-muted">{initial.date.split("-").reverse().join("/")}</span>
            <Badge tone={initial.result === "rejected" ? "danger" : "success"}>
              {RESULTS.find((item) => item.value === initial.result)?.label}
            </Badge>
            {!initial.valid && initial.result !== "rejected" ? (
              <Badge tone="warning">Vencido: mais de um ano</Badge>
            ) : null}
            <a href={initial.reportUrl} target="_blank" rel="noreferrer" className="text-accent-text underline">
              Ver laudo
            </a>
            {!readOnly ? (
              <Button type="button" size="sm" variant="outlineDanger" className="ml-auto" disabled={busy} onClick={handleRemove}>
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            ) : null}
          </div>
        ) : null}

        {!readOnly ? (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-x-4 sm:grid-cols-3">
              <FormField label="Empresa da vistoria" htmlFor="inspection-provider">
                <Input id="inspection-provider" name="provider" required maxLength={80} placeholder="Ex.: Dekra, Supervisão" />
              </FormField>
              <FormField label="Data do laudo" htmlFor="inspection-date">
                <Input id="inspection-date" name="date" type="date" required max={new Date().toISOString().slice(0, 10)} />
              </FormField>
              <FormField label="Resultado" htmlFor="inspection-result">
                <Select id="inspection-result" name="result" defaultValue="approved">
                  {RESULTS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} name="file" type="file" accept="application/pdf" required className="text-[13px]" />
              <Button type="submit" loading={busy}>
                {initial ? "Trocar laudo" : "Salvar vistoria"}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type Media360Values = { spin: string[]; pano: string | null };

export function Media360Card({
  vehicleId,
  initial,
  readOnly,
}: {
  vehicleId: string;
  initial: Media360Values;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const spinRef = useRef<HTMLInputElement>(null);
  const panoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);

  async function upload(kind: "spin" | "pano", list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (kind === "spin" && (files.length < SPIN_MIN_FRAMES || files.length > SPIN_MAX_FRAMES)) {
      toast.error(`Selecione de ${SPIN_MIN_FRAMES} a ${SPIN_MAX_FRAMES} fotos para o giro.`);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("kind", kind);
      // a ordem do giro é a do nome do arquivo: câmeras e apps de 360 numeram em sequência
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const [index, file] of files.entries()) {
        setBusy(kind === "spin" ? `Preparando ${index + 1} de ${files.length}…` : "Preparando…");
        const blob = await resizeSingle(file, kind === "spin" ? 1280 : 4096, 0.82);
        formData.append(kind === "spin" ? "frame" : "file", blob, blobFileName(blob, `${kind}-${index}`));
      }
      setBusy("Enviando…");
      const result = await apiUpload(`/api/admin/vehicles/${vehicleId}/media360`, formData);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(kind === "spin" ? "Giro 360° salvo." : "Panorâmica salva.");
        setFrame(0);
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no envio");
    }
    setBusy(null);
    const input = (kind === "spin" ? spinRef : panoRef).current;
    if (input) input.value = "";
  }

  async function remove(kind: "spin" | "pano") {
    setBusy("Removendo…");
    const result = await apiDelete(`/api/admin/vehicles/${vehicleId}/media360?tipo=${kind}`);
    setBusy(null);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visão 360°</CardTitle>
        <CardDescription>
          Giro externo: de {SPIN_MIN_FRAMES} a {SPIN_MAX_FRAMES} fotos tiradas em volta do carro, na
          mesma altura e distância, numeradas na ordem. Interior: uma foto panorâmica 360° (formato
          2:1, a que o celular gera no modo panorama 360). Qualquer um dos dois dá o selo
          &quot;360°&quot; no site e no portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-border p-3">
            <p className="mb-2 text-[13px] font-medium">Giro externo</p>
            {initial.spin.length > 0 ? (
              <>
                <div className="aspect-video overflow-hidden rounded bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={initial.spin[frame]} alt={`Quadro ${frame + 1}`} className="h-full w-full object-cover" />
                </div>
                <input
                  type="range"
                  min={0}
                  max={initial.spin.length - 1}
                  value={frame}
                  onChange={(event) => setFrame(Number(event.target.value))}
                  aria-label="Girar prévia"
                  className="mt-2 w-full"
                />
                <p className="text-xs text-muted">{initial.spin.length} quadros. Arraste para conferir o giro.</p>
              </>
            ) : (
              <p className="text-xs text-muted">Nenhum giro enviado.</p>
            )}
            {!readOnly ? (
              <div className="mt-3 flex gap-2">
                <input ref={spinRef} type="file" multiple accept={ACCEPTED_INPUT} className="hidden" onChange={(event) => upload("spin", event.target.files)} />
                <Button type="button" variant="secondary" size="sm" disabled={!!busy} onClick={() => spinRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {initial.spin.length ? "Trocar fotos" : "Enviar fotos"}
                </Button>
                {initial.spin.length ? (
                  <Button type="button" variant="outlineDanger" size="sm" disabled={!!busy} onClick={() => remove("spin")}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded border border-border p-3">
            <p className="mb-2 text-[13px] font-medium">Panorâmica do interior</p>
            {initial.pano ? (
              <div className="aspect-[2/1] overflow-hidden rounded bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={initial.pano} alt="Panorâmica do interior" className="h-full w-full object-cover" />
              </div>
            ) : (
              <p className="text-xs text-muted">Nenhuma panorâmica enviada.</p>
            )}
            {!readOnly ? (
              <div className="mt-3 flex gap-2">
                <input ref={panoRef} type="file" accept={ACCEPTED_INPUT} className="hidden" onChange={(event) => upload("pano", event.target.files)} />
                <Button type="button" variant="secondary" size="sm" disabled={!!busy} onClick={() => panoRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {initial.pano ? "Trocar panorâmica" : "Enviar panorâmica"}
                </Button>
                {initial.pano ? (
                  <Button type="button" variant="outlineDanger" size="sm" disabled={!!busy} onClick={() => remove("pano")}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {busy ? <p className="mt-3 text-xs text-muted">{busy}</p> : null}
      </CardContent>
    </Card>
  );
}
