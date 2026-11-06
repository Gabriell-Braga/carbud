"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormField, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client/api";
import { PERMISSION_LABELS, ROLE_LABELS, TENANT_PERMISSIONS, can } from "@/lib/auth/rbac";
import type { Role } from "@/db/schema";
import { ROLE_HINTS, type TeamMember } from "./team-panel";

/**
 * Tudo sobre o acesso de uma pessoa, num lugar só.
 *
 * Antes eram três botões na linha da tabela e o perfil num select solto, no
 * meio da lista — fácil demais de trocar por engano, e nenhum deles mostrava o
 * efeito do outro. Aqui a pessoa é vista inteira antes de qualquer mudança.
 */
export function ManageMember({
  member,
  isSelf,
  assignableRoles,
  stores,
  teams,
  showDistribution,
  showPermissions,
  onClose,
  onSaved,
  onResetPassword,
}: {
  member: TeamMember;
  isSelf: boolean;
  assignableRoles: Role[];
  stores: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  showDistribution: boolean;
  showPermissions: boolean;
  onClose: () => void;
  onSaved: () => void;
  onResetPassword: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [role, setRole] = useState<Role>(member.role);
  const [storeId, setStoreId] = useState(member.storeId ?? "");
  const [teamId, setTeamId] = useState(member.teamId ?? "");
  const [receivesLeads, setReceivesLeads] = useState(member.receivesLeads);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const [allowed, setAllowed] = useState<Set<string>>(() => {
    const base = new Set<string>();
    for (const permission of TENANT_PERMISSIONS) {
      const fromRole = can(member.role, permission);
      const granted = member.permissionOverrides?.granted?.includes(permission) ?? false;
      const revoked = member.permissionOverrides?.revoked?.includes(permission) ?? false;
      if ((fromRole || granted) && !revoked) base.add(permission);
    }
    return base;
  });

  function toggle(permission: string, checked: boolean) {
    setAllowed((current) => {
      const next = new Set(current);
      if (checked) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  /**
   * Trocar o perfil recalcula as permissões pela nova base.
   *
   * Manter as marcações do perfil antigo transformaria toda mudança de perfil
   * numa lista enorme de exceções — e a pessoa continuaria com acessos que o
   * novo perfil não dá, sem que ninguém tenha pedido isso.
   */
  function changeRole(next: Role) {
    setRole(next);
    setAllowed(new Set(TENANT_PERMISSIONS.filter((permission) => can(next, permission))));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const granted: string[] = [];
    const revoked: string[] = [];
    for (const permission of TENANT_PERMISSIONS) {
      const fromRole = can(role, permission);
      const now = allowed.has(permission);
      if (now && !fromRole) granted.push(permission);
      if (!now && fromRole) revoked.push(permission);
    }

    const payload: Record<string, unknown> = {
      storeId: storeId || null,
      receivesLeads,
      ...(teams.length > 0 ? { teamId: teamId || null } : {}),
    };
    // o próprio acesso não se altera daqui: a pessoa se trancaria para fora
    if (!isSelf) payload.role = role;
    if (showPermissions && !isSelf) {
      payload.permissionOverrides =
        granted.length === 0 && revoked.length === 0 ? null : { granted, revoked };
    }

    const result = await apiPatch(`/api/admin/users/${member.id}`, payload);
    setSaving(false);

    if (!result.ok) {
      toast.error("Não consegui salvar", result.error);
      return;
    }
    toast.success("Acesso atualizado", member.name);
    onSaved();
  }

  async function toggleStatus() {
    const disabling = member.status === "active";
    const confirmed = await confirm({
      title: disabling ? "Desativar acesso" : "Reativar acesso",
      description: disabling
        ? `${member.name} perde o acesso ao painel imediatamente e as sessões abertas são encerradas. O histórico e os leads da pessoa continuam aqui.`
        : `${member.name} volta a acessar o painel com o perfil de ${ROLE_LABELS[member.role]}.`,
      confirmLabel: disabling ? "Desativar" : "Reativar",
      tone: disabling ? "danger" : "default",
    });
    if (!confirmed) return;

    setTogglingStatus(true);
    const result = await apiPatch(`/api/admin/users/${member.id}`, {
      status: disabling ? "disabled" : "active",
    });
    setTogglingStatus(false);

    if (!result.ok) {
      toast.error("Não consegui alterar", result.error);
      return;
    }
    toast.success(disabling ? "Acesso desativado" : "Acesso reativado", member.name);
    onSaved();
  }

  const deviations = TENANT_PERMISSIONS.filter(
    (permission) => allowed.has(permission) !== can(role, permission),
  ).length;

  const showTeamFields = showDistribution || stores.length > 0 || teams.length > 0;

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={`Gerenciar ${member.name}`}
      description={member.email}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="manage-member-form" loading={saving}>
            Salvar
          </Button>
        </div>
      }
    >
      <form id="manage-member-form" onSubmit={handleSave} noValidate>
        {isSelf ? (
          <Alert tone="info" className="mb-4">
            Este é o seu acesso. Perfil e permissões não podem ser alterados por você mesmo. Peça
            a outro administrador.
          </Alert>
        ) : null}

        <FormField label="Perfil" htmlFor="manage-role" hint={ROLE_HINTS[role]}>
          <Select
            id="manage-role"
            value={role}
            disabled={isSelf}
            onChange={(event) => changeRole(event.target.value as Role)}
          >
            {assignableRoles.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </Select>
        </FormField>

        {showTeamFields ? (
          <fieldset className="mb-4 border-t border-border pt-4">
            <legend className="label-instrument mb-3 text-muted">Atuação</legend>

            {stores.length > 0 ? (
              <FormField
                label="Unidade"
                htmlFor="manage-store"
                hint="Sem unidade, a pessoa atende a revenda toda."
              >
                <Select
                  id="manage-store"
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                >
                  <option value="">Todas as unidades</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}

            {teams.length > 0 ? (
              <FormField label="Equipe" htmlFor="manage-team" hint="Filtra leads e agenda por equipe.">
                <Select
                  id="manage-team"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                >
                  <option value="">Sem equipe</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}

            {showDistribution ? (
              <label className="flex items-start gap-2 text-[13px] text-text">
                <Checkbox
                  className="mt-0.5"
                  checked={receivesLeads}
                  onChange={(event) => setReceivesLeads(event.target.checked)}
                />
                <span>
                  Entra no rodízio de leads
                  <span className="block text-xs text-faint">
                    Desmarque para quem está de férias ou não atende: o rodízio pula essa pessoa.
                  </span>
                </span>
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {showPermissions && !isSelf ? (
          <fieldset className="mb-4 border-t border-border pt-4">
            <legend className="label-instrument mb-2 text-muted">O que pode fazer</legend>
            <p className="mb-3 text-xs text-faint">
              Marcado é o que a pessoa pode.{" "}
              {deviations === 0
                ? "Tudo segue o perfil."
                : `${deviations} item(ns) fogem do perfil.`}
            </p>

            <div className="grid gap-1.5 sm:grid-cols-2">
              {TENANT_PERMISSIONS.map((permission) => {
                const fromRole = can(role, permission);
                const now = allowed.has(permission);
                const changed = now !== fromRole;
                return (
                  <label
                    key={permission}
                    className="flex items-center gap-2 text-[13px] text-text"
                  >
                    <Checkbox
                      checked={now}
                      onChange={(event) => toggle(permission, event.target.checked)}
                    />
                    <span>
                      {PERMISSION_LABELS[permission] ?? permission}
                      {changed ? (
                        <span className="ml-1.5 text-[11px] uppercase tracking-wide text-accent-text">
                          {now ? "extra" : "removido"}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            {allowed.size === 0 ? (
              <Alert tone="warning" className="mt-3">
                Sem nenhuma permissão a pessoa consegue entrar, mas não vê nada.
              </Alert>
            ) : null}
          </fieldset>
        ) : null}

        {/* ações que não são "salvar": ficam separadas para não serem clicadas
            no caminho de quem só queria ajustar o perfil */}
        <fieldset className="border-t border-border pt-4">
          <legend className="label-instrument mb-3 text-muted">Ações</legend>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onResetPassword}>
              <KeyRound className="h-3.5 w-3.5" />
              Redefinir senha
            </Button>

            {!isSelf ? (
              <Button
                type="button"
                size="sm"
                variant={member.status === "active" ? "outlineDanger" : "secondary"}
                loading={togglingStatus}
                onClick={toggleStatus}
              >
                {member.status === "active" ? "Desativar acesso" : "Reativar acesso"}
              </Button>
            ) : null}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
