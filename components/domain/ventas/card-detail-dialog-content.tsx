"use client";

/**
 * Actual pipeline card detail/edit/delete dialog implementation. Always
 * imported indirectly through `./card-detail-dialog.tsx`
 * (`dynamic(..., {ssr:false})`) — never import this file directly.
 *
 * Unlike `customer-form-dialog-content.tsx` / `nueva-card-dialog-content.tsx`
 * (which own a `trigger` + their own `open` `useState`), this dialog is
 * FULLY CONTROLLED by its caller (`pipeline-card.tsx`): `open`/`onOpenChange`
 * are passed in, because the "trigger" here is the whole draggable card
 * (a `useSortable` node), not a plain button a `DialogTrigger` could wrap.
 *
 * Shows every field EDITABLE immediately (title, stage, customer, amount,
 * notes) — no separate read-only "view" mode — matching every other
 * edit dialog in the app (`customer-form-dialog-content.tsx`,
 * `product-form-dialog-content.tsx`): a single form, pre-filled, PATCHed on
 * submit. Read-only `Creado`/`Actualizado` timestamps are shown for context.
 * Delete is wired through the shared `<ConfirmDialog>` (`components/ui/confirm-dialog.tsx`).
 *
 * Money convention: `amount` is edited as whole COP pesos via `<MoneyInput>`
 * (natural UX), converted to integer cents (`lib/money.ts`) only at submit —
 * same convention as `invoice-form-content.tsx`. An empty amount field means
 * "no deal value yet" (`null`), not `0`.
 *
 * Customer selection uses the `NO_CUSTOMER_VALUE` sentinel (mirroring
 * `invoice-item-fields.tsx`'s `OTRO_PRODUCT_VALUE` pattern) since the
 * underlying `<Select>` can't cleanly represent "no selection" as its own
 * explicit, clickable item distinct from the placeholder.
 *
 * Both PATCH and DELETE send EXPLICIT values (including `null` for a
 * cleared customer/amount/notes) rather than omitting the key — unlike
 * `customer-form-dialog-content.tsx`'s "blank optional fields are omitted"
 * convention. That omission convention only works for full-replace PATCH
 * payloads; here `PipelineCardUpdate` is a genuinely PARTIAL patch (any key
 * you don't include is left unchanged server-side), so clearing a
 * previously-set customer/amount/notes requires sending `null` explicitly —
 * omitting the key would silently no-op the clear.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type { ZodType } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { pipelineCardUpdateSchema } from "@/lib/schemas/pipeline";
import { pesosToCents } from "@/lib/money";
import { STAGE_CONFIG, STAGE_ORDER } from "./stage";
import type { PipelineCard, PipelineStage } from "@/lib/services/ports";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar la card. Verifica los datos e intenta de nuevo.";
const DELETE_ERROR_MESSAGE = "No se pudo eliminar la card. Intenta de nuevo.";

/** Sentinel `customerId` `<Select>` value meaning "no customer linked" — never a real `customers.id` (those are UUIDs). */
const NO_CUSTOMER_VALUE = "none";

export type CardDetailDialogCustomer = { id: string; name: string };

export type CardDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard;
  customers: CardDetailDialogCustomer[];
};

type CardDetailFormValues = {
  title: string;
  stage: PipelineStage;
  customerId: string;
  /** RAW pesos string for `<MoneyInput>` ("" = no amount). */
  amount: string;
  notes: string;
};

function toFormValues(card: PipelineCard): CardDetailFormValues {
  return {
    title: card.title,
    stage: card.stage,
    customerId: card.customerId ?? NO_CUSTOMER_VALUE,
    amount: card.amount != null ? String(card.amount / 100) : "",
    notes: card.notes ?? "",
  };
}

function toPayload(values: CardDetailFormValues) {
  return {
    title: values.title.trim(),
    stage: values.stage,
    customerId: values.customerId === NO_CUSTOMER_VALUE ? null : values.customerId,
    amount: values.amount.trim() ? pesosToCents(Number(values.amount)) : null,
    notes: values.notes.trim() ? values.notes.trim() : null,
  };
}

export default function CardDetailDialogContent({ open, onOpenChange, card, customers }: CardDetailDialogProps) {
  const router = useRouter();
  const [values, setValues] = useState<CardDetailFormValues>(() => toFormValues(card));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const payload = toPayload(values);
  const { errors, isValid } = useZodForm(pipelineCardUpdateSchema as ZodType<unknown>, payload);

  function updateField<K extends keyof CardDetailFormValues>(key: K, value: CardDetailFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (nextOpen) {
      setValues(toFormValues(card));
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/ventas/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/ventas/${card.id}`, { method: "DELETE" });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? DELETE_ERROR_MESSAGE);
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch {
      setError(DELETE_ERROR_MESSAGE);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalle de la card</DialogTitle>
          <DialogDescription>Edita la información o elimina esta card del pipeline.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-title">Título</Label>
            <Input
              id="card-title"
              name="title"
              required
              value={values.title}
              onChange={(event) => updateField("title", event.target.value)}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-stage">Estado</Label>
            <Select
              items={STAGE_ORDER.map((stage) => ({ value: stage, label: STAGE_CONFIG[stage].label }))}
              value={values.stage}
              onValueChange={(value) => updateField("stage", value as PipelineStage)}
            >
              <SelectTrigger id="card-stage" className="h-9 w-full">
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_CONFIG[stage].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-customer">Cliente</Label>
            <Select
              items={[
                { value: NO_CUSTOMER_VALUE, label: "Sin cliente" },
                ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
              ]}
              value={values.customerId}
              onValueChange={(value) => updateField("customerId", value ?? NO_CUSTOMER_VALUE)}
            >
              <SelectTrigger id="card-customer" className="h-9 w-full">
                <SelectValue placeholder="Selecciona un cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER_VALUE}>Sin cliente</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-amount">Monto (COP)</Label>
            <MoneyInput
              id="card-amount"
              name="amount"
              value={values.amount}
              onChange={(value) => updateField("amount", value)}
              aria-invalid={Boolean(errors.amount)}
            />
            {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-notes">Notas</Label>
            <Textarea
              id="card-notes"
              name="notes"
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
            <span>Creado: {new Date(card.createdAt).toLocaleString("es-CO")}</span>
            <span>Actualizado: {new Date(card.updatedAt).toLocaleString("es-CO")}</span>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" disabled={isSubmitting}>
                  <Trash2 className="size-4" />
                  Eliminar
                </Button>
              }
              title="Eliminar card"
              description="Esta acción no se puede deshacer."
              pending={isDeleting}
              onConfirm={handleDelete}
            />
            <Button type="submit" disabled={isSubmitting || isDeleting || !isValid}>
              {isSubmitting ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
