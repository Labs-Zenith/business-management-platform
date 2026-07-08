"use client";

/**
 * Actual "Registrar pago" dialog implementation, per
 * `docs/ui-ux-flow.md`'s "Registrar pago" section ("Mostrar saldo actual",
 * "No permitir monto mayor al saldo", "Actualizar estado calculado al
 * guardar"). Always imported indirectly through `./payment-form-dialog.tsx`
 * (`dynamic(..., {ssr: false})`) — never import this file directly from a
 * page, per the user's explicit lazy-loading requirement for form dialogs.
 *
 * POSTs directly to `/api/invoices/{invoiceId}/payments` (the dialog is the
 * client-side mutation boundary, matching
 * `customer-form-dialog-content.tsx`'s established pattern);
 * `router.refresh()` re-runs the invoice detail Server Component's data
 * fetch afterwards so the balance/status/payments table reflect the
 * server-computed result — the CLIENT-SIDE `amount > balance` check below is
 * UX-only (disables the submit button and shows an inline message before any
 * request is sent); the server (`lib/schemas/payment.ts` +
 * `lib/services/payment-service.ts` + `lib/mock/payment-repo.ts`) remains the
 * sole authority and always re-validates/rejects an overpay itself.
 *
 * Uses plain `useState` + native form, matching
 * `customer-form-dialog-content.tsx`'s established pattern — no
 * `react-hook-form` needed for four simple fields.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";
import { formatCOP } from "@/lib/money";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el pago. Verifica los datos e intenta de nuevo.";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type PaymentFormValues = {
  paymentDate: string;
  amount: string;
  method: string;
  notes: string;
};

function initialValues(): PaymentFormValues {
  return { paymentDate: todayIsoDate(), amount: "", method: "", notes: "" };
}

export type PaymentFormDialogProps = {
  invoiceId: string;
  /** Current pending balance, in integer cents — shown and used for the client-side cap. */
  balance: number;
  /** Rendered as the dialog's trigger (e.g. a "Registrar pago" button). */
  trigger: ReactElement;
};

export default function PaymentFormDialog({ invoiceId, balance, trigger }: PaymentFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PaymentFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountCents = Math.round((Number(values.amount) || 0) * 100);
  const exceedsBalance = amountCents > balance;

  function updateField<K extends keyof PaymentFormValues>(key: K, value: PaymentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(initialValues());
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (amountCents <= 0) {
      setError("El monto debe ser mayor a cero.");
      return;
    }
    if (exceedsBalance) {
      setError("El monto no puede exceder el saldo pendiente.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        paymentDate: values.paymentDate,
        amount: amountCents,
        ...(values.method.trim() ? { method: values.method.trim() } : {}),
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      };

      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Saldo pendiente actual: {formatCOP(balance)}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-date">Fecha</Label>
            <Input
              id="payment-date"
              name="paymentDate"
              type="date"
              required
              value={values.paymentDate}
              onChange={(event) => updateField("paymentDate", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Monto</Label>
            <Input
              id="payment-amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              value={values.amount}
              onChange={(event) => updateField("amount", event.target.value)}
            />
            {exceedsBalance ? (
              <p className="text-xs text-destructive">El monto no puede exceder el saldo pendiente.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-method">Metodo</Label>
            <Input
              id="payment-method"
              name="method"
              value={values.method}
              onChange={(event) => updateField("method", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-notes">Nota</Label>
            <Textarea
              id="payment-notes"
              name="notes"
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || exceedsBalance}>
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
