"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { maskCep, maskPhone } from "@carbud/site-kit/masks";
import {
  WHATSAPP_FORM_FIELDS,
  WHATSAPP_FORM_FIELD_LABELS,
  type WhatsappFormField,
} from "@carbud/site-kit/catalog";
import { apiPatch } from "@/lib/client/api";
import { lookupCep } from "@/lib/client/cep";
import { usePublishConfirm } from "./use-publish-confirm";

export type ContactValues = {
  phone: string;
  whatsapp: string;
  whatsappForm: boolean;
  whatsappFormFields: WhatsappFormField[];
  email: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressDistrict: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  mapsUrl: string;
  businessHours: { weekday: number; open: string | null; close: string | null }[];
  social: { instagram?: string; facebook?: string; youtube?: string; tiktok?: string };
};

const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const DEFAULT_OPEN = "08:00";
const DEFAULT_CLOSE = "18:00";

export function ContactPanel({
  initial,
  readOnly,
}: {
  initial: ContactValues;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmPublish = usePublishConfirm();
  const [values, setValues] = useState(initial);
  const [hours, setHours] = useState(() =>
    WEEKDAYS.map((_, weekday) => {
      // revenda que nunca salvou horário começa com o comercial de segunda a sexta
      if (initial.businessHours.length === 0) {
        const weekdayOpen = weekday >= 1 && weekday <= 5;
        return {
          weekday,
          open: weekdayOpen ? DEFAULT_OPEN : "",
          close: weekdayOpen ? DEFAULT_CLOSE : "",
          closed: !weekdayOpen,
        };
      }
      const found = initial.businessHours.find((hour) => hour.weekday === weekday);
      return {
        weekday,
        open: found?.open ?? "",
        close: found?.close ?? "",
        closed: !found || !found.open || !found.close,
      };
    }),
  );
  const [busy, setBusy] = useState(false);

  function update<K extends keyof ContactValues>(key: K, value: ContactValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleZip(zip: string) {
    update("addressZip", zip);
    const found = await lookupCep(zip);
    if (!found) return;
    setValues((current) => ({
      ...current,
      addressStreet: found.street || current.addressStreet,
      addressDistrict: found.district || current.addressDistrict,
      addressCity: found.city || current.addressCity,
      addressState: found.state || current.addressState,
    }));
    document.getElementById("addressNumber")?.focus();
  }

  async function handleSave() {
    if (!(await confirmPublish("Os dados de contato, endereço e horários"))) return;

    setBusy(true);

    const result = await apiPatch("/api/admin/site", {
      phone: values.phone,
      whatsapp: values.whatsapp,
      whatsappForm: values.whatsappForm,
      whatsappFormFields: values.whatsappFormFields,
      email: values.email,
      addressStreet: values.addressStreet,
      addressNumber: values.addressNumber,
      addressComplement: values.addressComplement,
      addressDistrict: values.addressDistrict,
      addressCity: values.addressCity,
      addressState: values.addressState,
      addressZip: values.addressZip,
      mapsUrl: values.mapsUrl,
      social: values.social,
      businessHours: hours
        .filter((hour) => !hour.closed && hour.open && hour.close)
        .map((hour) => ({ weekday: hour.weekday, open: hour.open, close: hour.close })),
    });

    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Dados de contato salvos.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
          <CardDescription>
            O WhatsApp alimenta os botões de contato do site com mensagem já preenchida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <FormField label="Telefone" htmlFor="phone">
              <Input
                id="phone"
                inputMode="tel"
                mask={maskPhone}
                value={values.phone}
                disabled={readOnly}
                onChange={(event) => update("phone", event.target.value)}
                placeholder="(11) 3333-4444"
              />
            </FormField>
            <FormField label="WhatsApp" htmlFor="whatsapp" hint="Com DDD">
              <Input
                id="whatsapp"
                inputMode="tel"
                mask={maskPhone}
                value={values.whatsapp}
                disabled={readOnly}
                onChange={(event) => update("whatsapp", event.target.value)}
                placeholder="(11) 99999-8888"
              />
            </FormField>
            <FormField label="E-mail" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={values.email}
                disabled={readOnly}
                onChange={(event) => update("email", event.target.value)}
              />
            </FormField>
          </div>
          <label className="mt-1 flex items-start gap-2 text-[13px] text-text">
            <Checkbox
              className="mt-0.5"
              checked={values.whatsappForm}
              disabled={readOnly}
              onChange={(event) => update("whatsappForm", event.target.checked)}
            />
            <span>
              Pedir os dados antes de abrir o WhatsApp
              <span className="block text-muted">
                Todo botão de WhatsApp do site abre um formulário curto; o contato entra como lead
                e a pessoa segue para o WhatsApp. Quem já preencheu vai direto nas próximas vezes.
              </span>
            </span>
          </label>

          {values.whatsappForm ? (
            <fieldset className="ml-6 mt-3">
              <legend className="mb-1.5 text-[13px] text-muted">Campos do formulário</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-text">
                {/* sem telefone o lead não tem como ser atendido: fica fixo */}
                <label className="flex items-center gap-2 text-muted">
                  <Checkbox checked disabled onChange={() => {}} />
                  Telefone (sempre)
                </label>
                {WHATSAPP_FORM_FIELDS.map((field) => (
                  <label key={field} className="flex items-center gap-2">
                    <Checkbox
                      checked={values.whatsappFormFields.includes(field)}
                      disabled={readOnly}
                      onChange={(event) =>
                        update(
                          "whatsappFormFields",
                          event.target.checked
                            ? [...values.whatsappFormFields, field]
                            : values.whatsappFormFields.filter((item) => item !== field),
                        )
                      }
                    />
                    {WHATSAPP_FORM_FIELD_LABELS[field]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="CEP" htmlFor="addressZip" hint="Preenche rua, bairro e cidade">
              <Input
                id="addressZip"
                inputMode="numeric"
                mask={maskCep}
                value={values.addressZip}
                disabled={readOnly}
                onChange={(event) => handleZip(event.target.value)}
                placeholder="00000-000"
              />
            </FormField>
            <FormField label="Rua" htmlFor="addressStreet" className="lg:col-span-2">
              <Input
                id="addressStreet"
                value={values.addressStreet}
                disabled={readOnly}
                onChange={(event) => update("addressStreet", event.target.value)}
              />
            </FormField>
            <FormField label="Número" htmlFor="addressNumber">
              <Input
                id="addressNumber"
                value={values.addressNumber}
                disabled={readOnly}
                onChange={(event) => update("addressNumber", event.target.value)}
              />
            </FormField>
            <FormField label="Complemento" htmlFor="addressComplement">
              <Input
                id="addressComplement"
                value={values.addressComplement}
                disabled={readOnly}
                onChange={(event) => update("addressComplement", event.target.value)}
              />
            </FormField>
            <FormField label="Bairro" htmlFor="addressDistrict">
              <Input
                id="addressDistrict"
                value={values.addressDistrict}
                disabled={readOnly}
                onChange={(event) => update("addressDistrict", event.target.value)}
              />
            </FormField>
            <FormField label="Cidade" htmlFor="addressCity">
              <Input
                id="addressCity"
                value={values.addressCity}
                disabled={readOnly}
                onChange={(event) => update("addressCity", event.target.value)}
              />
            </FormField>
            <FormField label="UF" htmlFor="addressState">
              <Input
                id="addressState"
                maxLength={2}
                value={values.addressState}
                disabled={readOnly}
                onChange={(event) => update("addressState", event.target.value.toUpperCase())}
              />
            </FormField>
            {/*
              O link do mapa saiu daqui.

              Ele era montado a partir do endereço que já está logo acima —
              pedir de novo, em forma de URL, é pedir à revenda que faça à mão
              o que o sistema faz sozinho, e abre espaço para o link apontar
              para um lugar diferente do endereço cadastrado.

              O campo continua no banco: revenda que tem ficha própria no
              Google e já tinha colado o link dela mantém o comportamento.
            */}
            <p className="text-[13px] text-muted lg:col-span-3">
              O mapa do site é montado com o endereço acima, então não precisa
              cadastrar link nenhum.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horário de funcionamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {hours.map((hour, index) => (
              <div key={hour.weekday} className="flex flex-wrap items-center gap-3">
                <span className="w-32 text-[13px] text-muted">{WEEKDAYS[hour.weekday]}</span>
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <Checkbox
                    checked={hour.closed}
                    disabled={readOnly}
                    onChange={(event) => {
                      const next = [...hours];
                      const closed = event.target.checked;
                      // reabrir um dia vazio já traz o horário comercial
                      next[index] = {
                        ...hour,
                        closed,
                        open: !closed && !hour.open ? DEFAULT_OPEN : hour.open,
                        close: !closed && !hour.close ? DEFAULT_CLOSE : hour.close,
                      };
                      setHours(next);
                    }}
                  />
                  Fechado
                </label>
                <Input
                  type="time"
                  className="w-32"
                  value={hour.open}
                  disabled={readOnly || hour.closed}
                  onChange={(event) => {
                    const next = [...hours];
                    next[index] = { ...hour, open: event.target.value };
                    setHours(next);
                  }}
                />
                <span className="text-[13px] text-faint">às</span>
                <Input
                  type="time"
                  className="w-32"
                  value={hour.close}
                  disabled={readOnly || hour.closed}
                  onChange={(event) => {
                    const next = [...hours];
                    next[index] = { ...hour, close: event.target.value };
                    setHours(next);
                  }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redes sociais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["instagram", "facebook", "youtube", "tiktok"] as const).map((network) => (
              <FormField
                key={network}
                label={network.charAt(0).toUpperCase() + network.slice(1)}
                htmlFor={network}
              >
                <Input
                  id={network}
                  value={values.social[network] ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    update("social", { ...values.social, [network]: event.target.value })
                  }
                  placeholder="https://..."
                />
              </FormField>
            ))}
          </div>
        </CardContent>
      </Card>


      {!readOnly ? (
        <Button type="button" loading={busy} onClick={handleSave}>
          Salvar contato
        </Button>
      ) : null}
    </div>
  );
}
