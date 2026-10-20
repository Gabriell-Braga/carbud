"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/field";
import {
  PasswordInput,
  PasswordMatchHint,
  PasswordRequirements,
} from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { apiPost, errorMessageFrom, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { firstPasswordIssue } from "@/lib/auth/password-policy";

export function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  /** Valida antes de ir ao servidor: erro na hora vale mais que ida e volta. */
  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!currentPassword) found.currentPassword = "Informe a senha atual.";

    const issue = firstPasswordIssue(newPassword);
    if (issue) found.newPassword = issue;
    else if (newPassword === currentPassword) {
      found.newPassword = "A nova senha precisa ser diferente da atual.";
    }

    if (!confirmPassword) found.confirmPassword = "Repita a nova senha.";
    else if (newPassword !== confirmPassword) found.confirmPassword = "As senhas não conferem.";

    return found;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const localErrors = validate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      toast.error("Confira os campos destacados", Object.values(localErrors)[0]);
      return;
    }

    setSaving(true);
    setErrors({});

    const result = await apiPost("/api/auth/change-password", {
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!result.ok) {
      setSaving(false);
      const fieldErrors = fieldErrorsFrom(result.details);
      setErrors(fieldErrors);
      toast.error(
        result.error === "Dados inválidos" ? "Não foi possível salvar" : result.error,
        errorMessageFrom(result),
      );
      return;
    }

    toast.success("Senha alterada.", "As outras sessões foram encerradas.");
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormField label="Senha atual" htmlFor="currentPassword" error={errors.currentPassword}>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          autoFocus
          value={currentPassword}
          aria-invalid={errors.currentPassword ? true : undefined}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormField>

      <div className="mb-4">
        <FormField label="Nova senha" htmlFor="newPassword" error={errors.newPassword} className="mb-0">
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            aria-invalid={errors.newPassword ? true : undefined}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </FormField>
        <PasswordRequirements value={newPassword} />
      </div>

      <div className="mb-5">
        <FormField
          label="Confirme a nova senha"
          htmlFor="confirmPassword"
          error={errors.confirmPassword}
          className="mb-0"
        >
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            aria-invalid={errors.confirmPassword ? true : undefined}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>
        {errors.confirmPassword ? null : (
          <PasswordMatchHint password={newPassword} confirmation={confirmPassword} />
        )}
      </div>

      <Button type="submit" className="w-full" size="lg" loading={saving}>
        Salvar nova senha
      </Button>
    </form>
  );
}
