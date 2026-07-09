"use client";

/**
 * Actual invoice create form implementation. Always imported indirectly
 * through `./invoice-form.tsx` (`dynamic(..., {ssr:false})`) — never import
 * this file directly from a page, per the user's explicit lazy-loading
 * requirement for the heaviest interactive form piece.
 *
 * Money convention: `unitPrice` is entered as whole COP pesos (natural UX —
 * typing raw integer cents would be unusable), converted to integer cents
 * (`lib/money.ts`'s convention) only at submit time. The displayed running
 * total is computed client-side purely for UX feedback
 * (`docs/ui-ux-flow.md`'s "Calcular total en pantalla") — the server always
 * recomputes and is the authoritative source (`lib/services/invoice-service.ts`).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { formatCOP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceItemFields } from "./invoice-item-fields";
import { invoiceFormSchema, type InvoiceFormValues } from "./invoice-form-schema";

const GENERIC_ERROR_MESSAGE = "No se pudo crear la factura. Verifica los datos e intenta de nuevo.";

export type InvoiceFormCustomer = { id: string; name: string };

export type InvoiceFormContentProps = {
  customers: InvoiceFormCustomer[];
  /** Preselects the customer, e.g. when arriving from "Crear factura para este cliente". */
  defaultCustomerId?: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoiceFormContent({ customers, defaultCustomerId }: InvoiceFormContentProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customerId: defaultCustomerId ?? "",
      issueDate: todayIsoDate(),
      dueDate: "",
      notes: "",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
    },
  });

  // `useWatch` (not `useForm()`'s returned `watch()`) — the dedicated hook is
  // safely memoizable and avoids the React Compiler "incompatible library"
  // bail-out that `watch()` triggers.
  const items = useWatch({ control, name: "items" });
  const totalCents = useMemo(
    () =>
      items.reduce((sum, item) => {
        const quantity = Number(item?.quantity) || 0;
        const unitPrice = Number(item?.unitPrice) || 0;
        return sum + Math.round(quantity * unitPrice * 100);
      }, 0),
    [items],
  );

  async function onSubmit(values: InvoiceFormValues) {
    setSubmitError(null);
    try {
      const payload = {
        customerId: values.customerId,
        issueDate: values.issueDate,
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
        items: values.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
        })),
      };

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setSubmitError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      const body: { data: { id: string } } = await response.json();
      router.push(`/invoices/${body.data.id}`);
      router.refresh();
    } catch {
      setSubmitError(GENERIC_ERROR_MESSAGE);
    }
  }

  return (
    <form className="flex w-full max-w-2xl flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-customer">Cliente</Label>
        <select
          id="invoice-customer"
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
          {...register("customerId")}
        >
          <option value="">Selecciona un cliente</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        {errors.customerId ? <p className="text-xs text-destructive">{errors.customerId.message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-issue-date">Fecha de emision</Label>
          <Input id="invoice-issue-date" type="date" {...register("issueDate")} />
          {errors.issueDate ? <p className="text-xs text-destructive">{errors.issueDate.message}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-due-date">Fecha de vencimiento</Label>
          <Input id="invoice-due-date" type="date" {...register("dueDate")} />
        </div>
      </div>

      <InvoiceItemFields control={control} register={register} errors={errors} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-notes">Nota</Label>
        <Textarea id="invoice-notes" {...register("notes")} />
      </div>

      <p className="text-sm font-medium">Total: {formatCOP(totalCents)}</p>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-fit">
        {isSubmitting ? "Guardando..." : "Crear factura"}
      </Button>
    </form>
  );
}
