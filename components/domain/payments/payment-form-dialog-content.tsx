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
import { todayIsoDate } from "@/lib/dates";
import { formatCOP, pesosToCents } from "@/lib/money";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el pago. Verifica los datos e intenta de nuevo.";

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

  const amountCents = pesosToCents(Number(values.amount) || 0);
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

    // `paymentDate` is required, but `DatePicker` is a `<button>` trigger, not
    // a native `<input>` — the HTML5 `required` attribute this field used to
    // carry never actually enforced anything anyway (the `<form>` above sets
    // `noValidate`), so this explicit check is the only thing that blocks a
    // cleared date from being submitted. This form uses plain `useState` (no
    // zod resolver), so the check is a manual `if (!value)` guard rather than
    // the `Controller` + zod `min(1, ...)` mechanism invoice's `issueDate` and
    // payroll's `referenceDate`/`paymentDate` use — different mechanism, same
    // conceptual precedent: enforcing "required" on a `DatePicker` field,
    // which has no native HTML `required` capability of its own.
    if (!values.paymentDate) {
      setError("Fecha de pago requerida.");
      return;
    }
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

      router.refresh();
      setOpen(false);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Saldo pendiente actual: {formatCOP(balance)}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-date">Fecha</Label>
            <DatePicker
              id="payment-date"
              value={values.paymentDate}
              onChange={(value) => updateField("paymentDate", value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Monto</Label>
            <MoneyInput
              id="payment-amount"
              name="amount"
              required
              value={values.amount}
              onChange={(value) => updateField("amount", value)}
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
            <Button type="submit" disabled={isSubmitting || exceedsBalance} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
