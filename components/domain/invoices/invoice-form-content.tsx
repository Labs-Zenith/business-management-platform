"use client";

/**
 * Actual invoice create/edit form implementation. Always imported indirectly
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
 *
 * Edit mode (`openspec/changes/invoice-edit-partial/specs/invoices/spec.md`'s
 * "Invoice Editing Locked to Fully-Paid Invoices"): passing the optional
 * `invoice` prop pre-fills every field from the existing invoice (cents
 * converted back to whole pesos for `unitPrice`, matching the create form's
 * input convention) and switches submission from `POST /api/invoices` to
 * `PATCH /api/invoices/{invoice.id}`. The caller (the edit page/route) is
 * solely responsible for only reaching this component with the `invoice`
 * prop while `invoice.balance > 0` (not fully paid) — this form itself does
 * not re-check that (the server's edit-lock in
 * `updateInvoice`/`InvoiceRepository.update` is the actual enforcement; the
 * UI-level gating is a defense-in-depth nicety on top of it, not a
 * replacement for it). It DOES, however, show a live UX-only warning and
 * disable submit once the LIVE computed total would drop below the
 * invoice's `paidAmount` — mirroring the server's separate "new total below
 * paid" rejection rule (also UX only; the server remains authoritative).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MoneyAmount } from "@/components/domain/money-amount";
import { todayIsoDate } from "@/lib/dates";
import { formatCOP, lineTotal, pesosToCents } from "@/lib/money";
import { InvoiceItemFields } from "./invoice-item-fields";
import { invoiceFormSchema, type InvoiceFormValues } from "./invoice-form-schema";

const CREATE_ERROR_MESSAGE = "No se pudo crear la factura. Verifica los datos e intenta de nuevo.";
const EDIT_ERROR_MESSAGE = "No se pudo guardar los cambios. Verifica los datos e intenta de nuevo.";

export type InvoiceFormCustomer = { id: string; name: string };

/** Minimal shape this form needs for the "Tipo de factura" dropdown — a subset of `InvoiceType` (`lib/services/ports.ts`). */
export type InvoiceFormInvoiceType = { id: string; code: string; label: string };

/**
 * Resolves the catalog's `venta` type as the create-mode default — matching
 * `lib/services/invoice-service.ts#resolveInvoiceTypeId`'s server-side
 * default exactly, so the form's pre-selected value is never a silent
 * mismatch with what the server would have defaulted to anyway. Falls back
 * to the first catalog entry (then `""`) only in the defensive case where
 * the `venta` type is somehow absent from the passed-in list.
 */
function defaultInvoiceTypeId(invoiceTypes: InvoiceFormInvoiceType[]): string {
  return invoiceTypes.find((type) => type.code === "venta")?.id ?? invoiceTypes[0]?.id ?? "";
}

/** Minimal shape this form needs to pre-fill edit mode — a subset of `InvoiceDetail`. */
export type InvoiceFormContentInvoice = {
  id: string;
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  items: {
    description: string;
    quantity: number;
    /** Integer minor units (COP cents), per `lib/money.ts`'s convention. */
    unitPrice: number;
  }[];
  /**
   * Integer minor units (COP cents) already collected against this invoice,
   * per `InvoiceDetail#paidAmount`. Used ONLY for the live below-paid-total
   * warning below — a UX-only early signal mirroring
   * `invoice-edit-partial`'s server-side rule that a new total may never
   * drop below `paidAmount`. The server remains authoritative; this never
   * blocks the request itself, only the submit button.
   */
  paidAmount: number;
};


export type InvoiceFormContentProps = {
  customers: InvoiceFormCustomer[];
  /** Sources the NEW "Tipo de factura" dropdown, create mode only (see this file's doc comment: the type is immutable after creation). */
  invoiceTypes: InvoiceFormInvoiceType[];
  /** Preselects the customer, e.g. when arriving from "Crear factura para este cliente". Ignored in edit mode. */
  defaultCustomerId?: string;
  /** When present, the form operates in edit mode: pre-fills from this invoice and PATCHes instead of POSTing. */
  invoice?: InvoiceFormContentInvoice;
};

function toDefaultValues(
  defaultCustomerId: string | undefined,
  invoice: InvoiceFormContentInvoice | undefined,
  invoiceTypes: InvoiceFormInvoiceType[],
): InvoiceFormValues {
  if (invoice) {
    return {
      customerId: invoice.customerId,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate ?? "",
      notes: invoice.notes ?? "",
      // The invoice type is immutable after creation (see this file's doc
      // comment) — the dropdown itself is not even rendered in edit mode, so
      // this value is never read/submitted, but the field must still exist
      // for `InvoiceFormValues`'s shape.
      invoiceTypeId: "",
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        // Cents -> whole pesos (raw string), the inverse of `pesosToCents`
        // applied at submit time — matches this form's "entered in pesos"
        // convention and `MoneyInput`'s raw-string contract.
        unitPrice: String(item.unitPrice / 100),
      })),
    };
  }
  return {
    customerId: defaultCustomerId ?? "",
    issueDate: todayIsoDate(),
    dueDate: "",
    notes: "",
    invoiceTypeId: defaultInvoiceTypeId(invoiceTypes),
    items: [{ description: "", quantity: 1, unitPrice: "" }],
  };
}

export default function InvoiceFormContent({
  customers,
  invoiceTypes,
  defaultCustomerId,
  invoice,
}: InvoiceFormContentProps) {
  const router = useRouter();
  const isEditing = Boolean(invoice);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: toDefaultValues(defaultCustomerId, invoice, invoiceTypes),
    // Live (as-you-type) validation: errors surface per field after its
    // first blur, then keep re-validating on every subsequent change.
    mode: "onTouched",
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
        // Mirrors `lib/services/invoice-service.ts`'s server-side computation
        // exactly: convert the raw peso `unitPrice` to cents first
        // (`pesosToCents`), then apply `lineTotal`'s round-half-up to the
        // quantity multiplication — the two rounding steps must happen in
        // this order (not `Math.round(quantity * unitPrice * 100)` in one
        // shot) so the displayed running total never drifts from what the
        // server persists.
        return sum + lineTotal(quantity, pesosToCents(unitPrice));
      }, 0),
    [items],
  );

  // Below-paid-total warning (this change's PR2, UX-only mirror of the
  // server's `invoice-edit-partial` rule): only applies in edit mode, and
  // only once the invoice already has a payment recorded — a brand-new
  // invoice or a create-mode form has no `paidAmount` to compare against.
  const isBelowPaidTotal = isEditing && invoice!.paidAmount > 0 && totalCents < invoice!.paidAmount;

  async function onSubmit(values: InvoiceFormValues) {
    setSubmitError(null);
    try {
      const payload = {
        customerId: values.customerId,
        issueDate: values.issueDate,
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
        // Create mode only — the invoice type is immutable after creation
        // (`invoice-service.ts#updateInvoice` never forwards it), so an edit
        // never sends it even though the schema still accepts the field.
        ...(!isEditing && values.invoiceTypeId ? { invoiceTypeId: values.invoiceTypeId } : {}),
        items: values.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: pesosToCents(Number(item.unitPrice) || 0),
        })),
      };

      const url = isEditing ? `/api/invoices/${invoice!.id}` : "/api/invoices";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setSubmitError(body?.error?.message ?? (isEditing ? EDIT_ERROR_MESSAGE : CREATE_ERROR_MESSAGE));
        return;
      }

      const body: { data: { id: string } } = await response.json();
      router.push(`/invoices/${body.data.id}`);
      router.refresh();
    } catch {
      setSubmitError(isEditing ? EDIT_ERROR_MESSAGE : CREATE_ERROR_MESSAGE);
    }
  }

  return (
    <form className="mx-auto flex w-full max-w-2xl flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-customer">Cliente</Label>
        <Controller
          control={control}
          name="customerId"
          render={({ field }) => (
            <Select
              items={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger id="invoice-customer" className="h-9 w-full" onBlur={field.onBlur}>
                <SelectValue placeholder="Selecciona un cliente" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.customerId ? <p className="text-xs text-destructive">{errors.customerId.message}</p> : null}
      </div>

      {!isEditing ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-type">Tipo de factura</Label>
          <Controller
            control={control}
            name="invoiceTypeId"
            render={({ field }) => (
              <Select
                items={invoiceTypes.map((type) => ({ value: type.id, label: type.label }))}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="invoice-type" className="h-9 w-full" onBlur={field.onBlur}>
                  <SelectValue placeholder="Selecciona un tipo de factura" />
                </SelectTrigger>
                <SelectContent>
                  {invoiceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.invoiceTypeId ? <p className="text-xs text-destructive">{errors.invoiceTypeId.message}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-issue-date">Fecha de emision</Label>
          <Controller
            control={control}
            name="issueDate"
            render={({ field }) => <DatePicker id="invoice-issue-date" value={field.value} onChange={field.onChange} />}
          />
          {errors.issueDate ? <p className="text-xs text-destructive">{errors.issueDate.message}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-due-date">Fecha de vencimiento</Label>
          <Controller
            control={control}
            name="dueDate"
            // `dueDate` is optional/clearable (design.md's resolved decision): no
            // forced default, `DatePicker` already renders its placeholder and
            // supports clearing back to `""` when `field.value` is empty.
            render={({ field }) => <DatePicker id="invoice-due-date" value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>

      <InvoiceItemFields control={control} register={register} errors={errors} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-notes">Nota</Label>
        <Textarea id="invoice-notes" {...register("notes")} />
      </div>

      <p className="flex items-baseline gap-1.5 text-sm font-medium">
        Total: <MoneyAmount cents={totalCents} size="sm" />
      </p>

      {isBelowPaidTotal ? (
        <p className="text-xs text-destructive">
          {`El total no puede ser menor a lo ya pagado (${formatCOP(invoice!.paidAmount)}).`}
        </p>
      ) : null}

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting || isBelowPaidTotal || !isValid} className="w-full sm:w-fit">
        {isSubmitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear factura"}
      </Button>
    </form>
  );
}
