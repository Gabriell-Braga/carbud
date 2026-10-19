"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { maskCep, maskPhone } from "@carbud/site-kit/masks";
import { apiDelete, apiPatch, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { lookupCep } from "@/lib/client/cep";

export type StoreRow = {
  id: string;
  name: string;
  slug: string;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  isDefault: boolean;
  active: boolean;
};

function emptyStore(): StoreRow {
  return {
    id: "",
    name: "",
    slug: "",
    whatsapp: "",
    phone: "",
    email: "",
    addressZip: "",
    addressStreet: "",
    addressNumber: "",
    addressComplement: "",
    addressDistrict: "",
    addressCity: "",
    addressState: "",
    isDefault: false,
    active: true,
  };
}

export function StoresPanel({ stores, canWrite }: { stores: StoreRow[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<StoreRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(store: StoreRow) {
    const confirmed = await confirm({
      title: "Excluir unidade",
      description: `"${store.name}" é removida. Veículos e pessoas que estavam nela ficam sem unidade, mas nada é apagado junto.`,
      confirmLabel: "Excluir unidade",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(store.id);
    const result = await apiDelete(`/api/admin/stores/${store.id}`);
    setDeletingId(null);

    if (!result.ok) {
      toast.error("Não consegui excluir", result.error);
      return;
    }
    toast.success("Unidade excluída");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Unidades</CardTitle>
            <CardDescription>
              A unidade padrão recebe o que não tem loja escolhida. Ela não pode ser desativada nem
              excluída sem que outra assuma o lugar.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button type="button" className="shrink-0" onClick={() => setEditing(emptyStore())}>
              <Plus className="h-3.5 w-3.5" />
              Nova unidade
            </Button>
          ) : null}
        </CardHeader>

        {stores.length === 0 ? (
          <EmptyState
            title="Nenhuma unidade cadastrada"
            description="Sem unidades, estoque e equipe seguem em uma loja só."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Unidade</Th>
                <Th>Cidade</Th>
                <Th>Contato</Th>
                <Th>Situação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {stores.map((store) => (
                <Tr key={store.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text">{store.name}</span>
                      {store.isDefault ? <Badge tone="info">Padrão</Badge> : null}
                    </div>
                    <div className="text-xs text-faint">{store.slug}</div>
                  </Td>
                  <Td>
                    {[store.addressCity, store.addressState].filter(Boolean).join(" / ") || "—"}
                  </Td>
                  <Td>{store.whatsapp || store.phone || "—"}</Td>
                  <Td>
                    <Badge tone={store.active ? "success" : "neutral"}>
                      {store.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </Td>
                  <Td>
                    {canWrite ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(store)}
                          aria-label={`Editar ${store.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={deletingId === store.id}
                          onClick={() => handleDelete(store)}
                          aria-label={`Excluir ${store.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing ? (
        <StoreEditor
          store={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function StoreEditor({
  store,
  onClose,
  onSaved,
}: {
  store: StoreRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !store.id;
  const [draft, setDraft] = useState(store);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function set<K extends keyof StoreRow>(key: K, value: StoreRow[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleZip(zip: string) {
    set("addressZip", zip);
    const found = await lookupCep(zip);
    if (!found) return;
    setDraft((current) => ({
      ...current,
      addressStreet: found.street || current.addressStreet,
      addressDistrict: found.district || current.addressDistrict,
      addressCity: found.city || current.addressCity,
      addressState: found.state || current.addressState,
    }));
    document.getElementById("store-number")?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      name: draft.name.trim(),
      whatsapp: draft.whatsapp?.trim() || null,
      phone: draft.phone?.trim() || null,
      email: draft.email?.trim() || null,
      addressZip: draft.addressZip?.trim() || null,
      addressStreet: draft.addressStreet?.trim() || null,
      addressNumber: draft.addressNumber?.trim() || null,
      addressComplement: draft.addressComplement?.trim() || null,
      addressDistrict: draft.addressDistrict?.trim() || null,
      addressCity: draft.addressCity?.trim() || null,
      addressState: draft.addressState?.trim().toUpperCase() || null,
      isDefault: draft.isDefault,
      active: draft.active,
    };

    const result = isNew
      ? await apiPost("/api/admin/stores", payload)
      : await apiPatch(`/api/admin/stores/${draft.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(isNew ? "Não consegui criar" : "Não consegui salvar", result.error);
      return;
    }
    toast.success(isNew ? "Unidade criada" : "Unidade salva");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={isNew ? "Nova unidade" : `Editar ${store.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="store-form" loading={saving}>
            {isNew ? "Criar unidade" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="store-form" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Nome" htmlFor="store-name" error={errors.name}>
            <Input
              id="store-name"
              required
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Loja Centro"
            />
          </FormField>
          <FormField label="WhatsApp" htmlFor="store-whatsapp">
            <Input
              id="store-whatsapp"
              inputMode="tel"
              mask={maskPhone}
              value={draft.whatsapp ?? ""}
              onChange={(event) => set("whatsapp", event.target.value)}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="store-phone">
            <Input
              id="store-phone"
              inputMode="tel"
              mask={maskPhone}
              value={draft.phone ?? ""}
              onChange={(event) => set("phone", event.target.value)}
            />
          </FormField>
          <FormField label="E-mail" htmlFor="store-email" error={errors.email}>
            <Input
              id="store-email"
              type="email"
              value={draft.email ?? ""}
              onChange={(event) => set("email", event.target.value)}
            />
          </FormField>
        </div>

        <fieldset className="mb-4 border-t border-border pt-4">
          <legend className="label-instrument mb-3 text-muted">Endereço</legend>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="CEP" htmlFor="store-zip">
              <Input
                id="store-zip"
                inputMode="numeric"
                mask={maskCep}
                placeholder="00000-000"
                value={draft.addressZip ?? ""}
                onChange={(event) => handleZip(event.target.value)}
              />
            </FormField>
            <FormField label="Rua" htmlFor="store-street" className="lg:col-span-2">
              <Input
                id="store-street"
                value={draft.addressStreet ?? ""}
                onChange={(event) => set("addressStreet", event.target.value)}
              />
            </FormField>
            <FormField label="Número" htmlFor="store-number">
              <Input
                id="store-number"
                value={draft.addressNumber ?? ""}
                onChange={(event) => set("addressNumber", event.target.value)}
              />
            </FormField>
            <FormField label="Complemento" htmlFor="store-complement">
              <Input
                id="store-complement"
                value={draft.addressComplement ?? ""}
                onChange={(event) => set("addressComplement", event.target.value)}
              />
            </FormField>
            <FormField label="Bairro" htmlFor="store-district">
              <Input
                id="store-district"
                value={draft.addressDistrict ?? ""}
                onChange={(event) => set("addressDistrict", event.target.value)}
              />
            </FormField>
            <FormField label="Cidade" htmlFor="store-city">
              <Input
                id="store-city"
                value={draft.addressCity ?? ""}
                onChange={(event) => set("addressCity", event.target.value)}
              />
            </FormField>
            <FormField label="UF" htmlFor="store-state">
              <Input
                id="store-state"
                maxLength={2}
                value={draft.addressState ?? ""}
                onChange={(event) => set("addressState", event.target.value)}
              />
            </FormField>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] text-text">
            <Checkbox
              checked={draft.active}
              onChange={(event) => set("active", event.target.checked)}
            />
            Ativa
          </label>
          <label className="flex items-start gap-2 text-[13px] text-text">
            <Checkbox
              className="mt-0.5"
              checked={draft.isDefault}
              onChange={(event) => set("isDefault", event.target.checked)}
            />
            <span>
              Unidade padrão
              <span className="block text-xs text-faint">
                Recebe veículos, pessoas e leads que não tiverem unidade escolhida.
              </span>
            </span>
          </label>
        </div>
      </form>
    </Dialog>
  );
}
