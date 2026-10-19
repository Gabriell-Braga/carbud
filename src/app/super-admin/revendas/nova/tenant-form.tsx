"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TemplatePicker } from "@/components/admin/template-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { maskCnpj, maskPhone } from "@carbud/site-kit/masks";
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { apiPost, errorMessageFrom, fieldErrorsFrom } from "@/lib/client/api";
import { CurrencyInput } from "@/components/ui/number-field";
import { DEFAULT_TEMPLATE_ID } from "@carbud/site-kit/manifests";
import { slugify } from "@/lib/utils";

export function NewTenantForm() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // em centavos: o texto do campo passava por replace(",", "."), que vira NaN
  // em "1.500,00" e gravaria mensalidade zero sem ninguém ver
  const [amountCents, setAmountCents] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [withAdmin, setWithAdmin] = useState(true);
  const [adminPassword, setAdminPassword] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const payload = {
      name,
      slug,
      templateId,
      legalName: String(form.get("legalName") ?? ""),
      cnpj: String(form.get("cnpj") ?? ""),
      blockMode: String(form.get("blockMode") ?? "readonly"),
      notes: String(form.get("notes") ?? ""),
      phone: String(form.get("phone") ?? ""),
      whatsapp: String(form.get("whatsapp") ?? ""),
      email: String(form.get("email") ?? ""),
      addressCity: String(form.get("addressCity") ?? ""),
      addressState: String(form.get("addressState") ?? ""),
      dueDay: Number(form.get("dueDay") ?? 10),
      amountCents,
      ...(withAdmin
        ? {
            adminName: String(form.get("adminName") ?? ""),
            adminEmail: String(form.get("adminEmail") ?? ""),
            adminPassword,
          }
        : {}),
    };

    const result = await apiPost<{ id: string }>("/api/super-admin/tenants", payload);

    if (!result.ok) {
      setFieldErrors(fieldErrorsFrom(result.details));
      toast.error(
        result.error === "Dados inválidos" ? "Confira os campos destacados" : result.error,
        errorMessageFrom(result),
      );
      setSaving(false);
      return;
    }

    toast.success("Revenda criada.");
    router.push(`/super-admin/revendas/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados da revenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="Nome da revenda" htmlFor="name" error={fieldErrors.name}>
              <Input
                id="name"
                required
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Auto Center Silva"
              />
            </FormField>

            <FormField
              label="Slug"
              htmlFor="slug"
              hint={slug ? `O site ficará em /r/${slug}` : "Gerado a partir do nome"}
              error={fieldErrors.slug}
            >
              <Input
                id="slug"
                required
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
                placeholder="auto-center-silva"
              />
            </FormField>

            <FormField label="Razão social" htmlFor="legalName">
              <Input id="legalName" name="legalName" placeholder="Opcional" />
            </FormField>

            <FormField label="CNPJ" htmlFor="cnpj">
              <Input
                id="cnpj"
                name="cnpj"
                inputMode="numeric"
                mask={maskCnpj}
                placeholder="Opcional"
              />
            </FormField>

            <FormField label="Telefone" htmlFor="phone">
              <Input
                id="phone"
                name="phone"
                inputMode="tel"
                mask={maskPhone}
                placeholder="(11) 3333-4444"
              />
            </FormField>

            <FormField label="WhatsApp" htmlFor="whatsapp">
              <Input
                id="whatsapp"
                name="whatsapp"
                inputMode="tel"
                mask={maskPhone}
                placeholder="(11) 99999-8888"
              />
            </FormField>

            <FormField label="E-mail de contato" htmlFor="email">
              <Input id="email" name="email" type="email" placeholder="contato@revenda.com.br" />
            </FormField>

            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <FormField label="Cidade" htmlFor="addressCity">
                <Input id="addressCity" name="addressCity" placeholder="São Paulo" />
              </FormField>
              <FormField label="UF" htmlFor="addressState">
                <Input id="addressState" name="addressState" maxLength={2} placeholder="SP" />
              </FormField>
            </div>
          </div>

          <FormField label="Observações internas" htmlFor="notes" className="mb-0">
            <Textarea
              id="notes"
              name="notes"
              placeholder="Anotações visíveis só para a equipe interna"
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template do site</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplatePicker value={templateId} onChange={setTemplateId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assinatura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <FormField label="Mensalidade (R$)" htmlFor="amount">
              <CurrencyInput
                id="amount"
                valueCents={amountCents}
                onChangeCents={setAmountCents}
              />
            </FormField>
            <FormField label="Dia do vencimento" htmlFor="dueDay">
              <Select id="dueDay" name="dueDay" defaultValue="10">
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    Dia {day}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Bloqueio na suspensão"
              htmlFor="blockMode"
              hint="Como o painel se comporta quando suspensa"
            >
              <Select id="blockMode" name="blockMode" defaultValue="readonly">
                <option value="readonly">Somente leitura</option>
                <option value="full">Bloqueio total</option>
              </Select>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acesso inicial</CardTitle>
          <CardDescription>
            O responsável recebe uma senha provisória e troca no primeiro acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="mb-4 flex items-center gap-2 text-[13px] text-muted">
            <Checkbox checked={withAdmin} onChange={(event) => setWithAdmin(event.target.checked)} />
            Criar o usuário administrador da revenda agora
          </label>

          {withAdmin ? (
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
              <FormField label="Nome do responsável" htmlFor="adminName">
                <Input id="adminName" name="adminName" required={withAdmin} />
              </FormField>
              <FormField
                label="E-mail de acesso"
                htmlFor="adminEmail"
                error={fieldErrors.adminEmail}
              >
                <Input id="adminEmail" name="adminEmail" type="email" required={withAdmin} />
              </FormField>
              <FormField
                label="Senha provisória"
                htmlFor="adminPassword"
                error={fieldErrors.adminPassword}
              >
                <PasswordInput
                  id="adminPassword"
                  name="adminPassword"
                  autoComplete="new-password"
                  required={withAdmin}
                  value={adminPassword}
                  aria-invalid={fieldErrors.adminPassword ? true : undefined}
                  onChange={(event) => setAdminPassword(event.target.value)}
                />
                {/*
                  Os requisitos ficam DENTRO do campo da senha, não embaixo da
                  linha: fora daqui eles começavam na primeira coluna do grid,
                  debaixo do nome do responsável, e pareciam falar do e-mail.
                  Uma por linha, porque a coluna é um terço da largura.
                */}
                <PasswordRequirements value={adminPassword} className="sm:grid-cols-1" />
              </FormField>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          Criar revenda
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
