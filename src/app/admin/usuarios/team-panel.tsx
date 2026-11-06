"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select } from "@/components/ui/field";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import type { Role } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import { ManageMember } from "./manage-member";
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import {
  apiPost,
  apiPut,
  errorMessageFrom,
  fieldErrorsFrom,
  type FieldErrors,
} from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  storeId: string | null;
  teamId: string | null;
  receivesLeads: boolean;
  permissionOverrides: { granted?: string[]; revoked?: string[] } | null;
};

export const ROLE_HINTS: Record<string, string> = {
  revenda_admin: "Acesso total ao painel da revenda, inclusive site e usuários.",
  vendedor: "Gerencia estoque e leads. Não mexe nas configurações do site nem em usuários.",
  visualizador: "Somente leitura em estoque, leads e configurações.",
};

/** Quem está fora do ar aparece esmaecido, mas continua legível. */
const ROLE_TONE = {
  revenda_admin: "info",
  vendedor: "neutral",
  visualizador: "neutral",
} as const;

export function TeamPanel({
  members,
  currentUserId,
  assignableRoles,
  canWrite,
  stores,
  teams,
  showDistribution,
  showPermissions,
}: {
  members: TeamMember[];
  currentUserId: string;
  assignableRoles: Role[];
  canWrite: boolean;
  stores: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  showDistribution: boolean;
  showPermissions: boolean;
}) {
  const router = useRouter();
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [managing, setManaging] = useState<TeamMember | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  async function resetPassword(password: string): Promise<boolean> {
    if (!resetTarget) return false;

    const result = await apiPut(`/api/admin/users/${resetTarget.id}`, {
      password,
      mustChangePassword: true,
    });

    if (!result.ok) {
      toast.error("Não foi possível redefinir", errorMessageFrom(result));
      return false;
    }
    toast.success("Senha redefinida.", `As sessões de ${resetTarget.email} foram encerradas.`);
    router.refresh();
    return true;
  }

  const active = members.filter((member) => member.status === "active").length;

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>
              {active} pessoa(s) com acesso
              {members.length > active ? ` · ${members.length - active} desativada(s)` : ""}.
              Cada uma é gerenciada num lugar só: perfil, unidade e permissões.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button type="button" className="shrink-0" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar pessoa
            </Button>
          ) : null}
        </CardHeader>

        <Table>
          <Thead>
            <Tr>
              <Th>Pessoa</Th>
              <Th>Perfil</Th>
              <Th>Situação</Th>
              <Th numeric>Último acesso</Th>
              <Th />
            </Tr>
          </Thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.id === currentUserId;
              const disabled = member.status !== "active";

              return (
                <Tr key={member.id} className={disabled ? "opacity-60" : undefined}>
                  <Td>
                    <p className="font-medium text-text">
                      {member.name}
                      {isSelf ? (
                        <span className="ml-2 text-xs font-normal text-faint">(você)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">{member.email}</p>
                  </Td>

                  {/* perfil é leitura na tabela: trocar acesso num select solto
                      no meio da lista é fácil demais de fazer por engano */}
                  <Td>
                    <Badge tone={ROLE_TONE[member.role as keyof typeof ROLE_TONE] ?? "neutral"}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  </Td>

                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={disabled ? "neutral" : "success"}>
                        {disabled ? "Desativado" : "Ativo"}
                      </Badge>
                      {member.mustChangePassword ? (
                        <Badge tone="warning">Senha provisória</Badge>
                      ) : null}
                      {showDistribution && !member.receivesLeads && !disabled ? (
                        <Badge tone="neutral">Fora do rodízio</Badge>
                      ) : null}
                    </div>
                  </Td>

                  <Td numeric className="text-muted">
                    {member.lastLoginAt
                      ? formatDateTime(new Date(member.lastLoginAt))
                      : "Nunca acessou"}
                  </Td>

                  <Td className="text-right">
                    {canWrite ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setManaging(member)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Gerenciar
                      </Button>
                    ) : null}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {managing ? (
        <ManageMember
          member={managing}
          isSelf={managing.id === currentUserId}
          assignableRoles={assignableRoles}
          stores={stores}
          teams={teams}
          showDistribution={showDistribution}
          showPermissions={showPermissions}
          onClose={() => setManaging(null)}
          onResetPassword={() => {
            setResetTarget(managing);
            setManaging(null);
          }}
          onSaved={() => {
            setManaging(null);
            router.refresh();
          }}
        />
      ) : null}

      {adding ? (
        <AddMember
          assignableRoles={assignableRoles}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}

      <ResetPasswordDialog
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userLabel={resetTarget?.email ?? ""}
        onConfirm={resetPassword}
      />
    </>
  );
}

function AddMember({
  assignableRoles,
  onClose,
  onSaved,
}: {
  assignableRoles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(assignableRoles.includes("vendedor") ? "vendedor" : assignableRoles[0]);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const result = await apiPost("/api/admin/users", {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role,
      password,
      mustChangePassword: true,
    });

    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(
        result.error === "Dados inválidos" ? "Confira os campos destacados" : result.error,
        errorMessageFrom(result),
      );
      return;
    }
    toast.success("Acesso criado", "Passe a senha provisória para a pessoa.");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title="Adicionar pessoa"
      description="A senha é provisória: no primeiro acesso a pessoa é obrigada a trocar."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="add-member-form" loading={saving}>
            Criar acesso
          </Button>
        </div>
      }
    >
      <form id="add-member-form" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Nome" htmlFor="member-name" error={errors.name}>
            <Input id="member-name" name="name" required />
          </FormField>
          <FormField label="E-mail" htmlFor="member-email" error={errors.email}>
            <Input id="member-email" name="email" type="email" required />
          </FormField>
        </div>

        {/* a explicação do perfil fica junto da escolha, não num card à parte
            que ninguém lê na hora que importa */}
        <FormField label="Perfil" htmlFor="member-role" hint={ROLE_HINTS[role]}>
          <Select
            id="member-role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {assignableRoles.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Senha provisória"
          htmlFor="member-password"
          error={errors.password}
          className="mb-2"
        >
          <PasswordInput
            id="member-password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            aria-invalid={errors.password ? true : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        <PasswordRequirements value={password} />
      </form>
    </Dialog>
  );
}
