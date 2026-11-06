"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";

type Team = { id: string; name: string };

/** Equipes de venda (motos, carros...). A pessoa entra na equipe pelo "Gerenciar". */
export function TeamsCard({ teams: initial, canWrite }: { teams: Team[]; canWrite: boolean }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [teams, setTeams] = useState(initial);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await apiPost<{ teams: Team[] }>("/api/admin/teams", { name: name.trim() });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não consegui criar a equipe", result.error);
      return;
    }
    setTeams(result.data.teams);
    setName("");
    router.refresh();
  }

  async function rename(team: Team, next: string) {
    if (next.trim() === team.name || next.trim().length < 2) return;
    const result = await apiPatch<{ teams: Team[] }>(`/api/admin/teams/${team.id}`, { name: next.trim() });
    if (!result.ok) {
      toast.error("Não consegui renomear", result.error);
      return;
    }
    setTeams(result.data.teams);
    toast.success("Equipe renomeada");
    router.refresh();
  }

  async function remove(team: Team) {
    const ok = await confirm({
      title: `Apagar a equipe ${team.name}?`,
      description: "As pessoas continuam no painel, só ficam sem equipe.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;
    const result = await apiDelete<{ teams: Team[] }>(`/api/admin/teams/${team.id}`);
    if (!result.ok) {
      toast.error("Não consegui apagar", result.error);
      return;
    }
    setTeams(result.data.teams);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipes</CardTitle>
        <CardDescription>
          Separe quem vende o quê (motos, carros, seminovos). Leads e agenda filtram por equipe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {teams.length === 0 ? (
          <p className="mb-3 text-[13px] text-faint">Nenhuma equipe ainda.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {teams.map((team) => (
              <li key={team.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Nome da equipe ${team.name}`}
                  defaultValue={team.name}
                  maxLength={40}
                  disabled={!canWrite}
                  onBlur={(event) => void rename(team, event.target.value)}
                />
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Apagar ${team.name}`}
                    onClick={() => remove(team)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <form onSubmit={add} className="flex gap-2">
            <Input
              id={`${id}-name`}
              aria-label="Nome da nova equipe"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="Motos"
            />
            <Button type="submit" variant="secondary" loading={saving} disabled={name.trim().length < 2}>
              Criar
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
