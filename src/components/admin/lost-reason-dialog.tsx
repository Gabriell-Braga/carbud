"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Select, Textarea } from "@/components/ui/field";
import { LOST_REASONS, type LostReason } from "@/db/schema";
import { ESCALATED_LOST_REASONS, LOST_REASON_LABELS } from "@/lib/catalog/labels";

export type LostChoice = { lostReason: LostReason; lostNote?: string };

/**
 * Pergunta por que a venda não saiu antes de marcar como perdida.
 *
 * Usado na ficha do lead e no quadro do funil: são dois caminhos para o mesmo
 * ato, e a API recusa os dois sem motivo.
 */
export function LostReasonDialog({
  open,
  leadName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadName: string;
  onCancel: () => void;
  onConfirm: (choice: LostChoice) => Promise<void> | void;
}) {
  const id = useId();
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setReason("");
    setNote("");
    onCancel();
  }

  async function confirm() {
    if (!reason) return;
    setSaving(true);
    await onConfirm({ lostReason: reason, lostNote: note.trim() || undefined });
    setSaving(false);
    setReason("");
    setNote("");
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Por que a venda não saiu?"
      description={`${leadName} vai para perdidos.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            Voltar
          </Button>
          <Button type="button" variant="danger" disabled={!reason} loading={saving} onClick={confirm}>
            Marcar como perdido
          </Button>
        </div>
      }
    >
      <FormField
        label="Motivo"
        htmlFor={`${id}-reason`}
        hint={
          reason && ESCALATED_LOST_REASONS.includes(reason)
            ? "A gerência recebe um aviso para tentar reverter."
            : undefined
        }
      >
        <Select
          id={`${id}-reason`}
          value={reason}
          onChange={(event) => setReason(event.target.value as LostReason)}
        >
          <option value="">Escolha</option>
          {LOST_REASONS.map((item) => (
            <option key={item} value={item}>
              {LOST_REASON_LABELS[item]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="O que aconteceu (opcional)" htmlFor={`${id}-note`} className="mb-0">
        <Textarea
          id={`${id}-note`}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Achou R$ 3 mil mais barato na concorrência..."
        />
      </FormField>
    </Dialog>
  );
}
