"use client";

/**
 * Actual create/edit customer form + dialog implementation, mirroring
 * `employee-form-dialog-content.tsx`'s established dialog pattern (plain
 * `useState` + native form). Always imported indirectly through
 * `./customer-form-dialog.tsx` (`dynamic(..., {ssr: false})`) — never import
 * this file directly from a page.
 *
 * Reuses the exact field set, `toFormValues`, and payload logic that used to
 * live in `customer-form-content.tsx` (the page-based form this dialog
 * replaces). The only behavioral change vs. that page form: on success this
 * closes the dialog (`setOpen(false)`) and calls `router.refresh()` instead
 * of navigating (`router.push`), matching every other dialog in the app
 * (employees, products, movements, payments, expenses).
 *
 * Mutations POST/PATCH `/api/customers` directly (the dialog is the
 * client-side mutation boundary); `router.refresh()` re-runs the
 * Server Component fetch afterwards so the Clientes list/detail reflects the
 * change.
 *
 * LIVE (as-you-type) validation is layered on top via the shared
 * `useZodForm` hook (`lib/hooks/use-zod-form.ts`), fed the SAME shape
 * `toDescriptivePayload` already builds for submit — `lib/schemas/customer.ts`
 * (`customerCreateSchema`/`customerUpdateSchema`, matching `mode`) is the
 * single source of truth for both the inline client errors and the server's
 * own `safeParse`. Each field only shows its error once `touched` (via
 * `onBlur`, or "touch all" on a submit attempt), so a pristine dialog never
 * opens already showing errors. The submit button stays disabled while
 * `!isValid`, in addition to the existing `isSubmitting` guard.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";
import type { ZodType } from "zod";
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
import { Switch } from "@/components/ui/switch";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { customerCreateSchema, customerUpdateSchema } from "@/lib/schemas/customer";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar el cliente. Verifica los datos e intenta de nuevo.";

export type CustomerFormDialogCustomer = {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

type CustomerFormValues = {
  name: string;
  documentNumber: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
};

function toFormValues(customer?: CustomerFormDialogCustomer): CustomerFormValues {
  return {
    name: customer?.name ?? "",
    documentNumber: customer?.documentNumber ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
    isActive: customer?.isActive ?? true,
  };
}

/** Blank optional strings are omitted entirely (sent as absent, not `""`). */
function toDescriptivePayload(values: CustomerFormValues): Record<string, string> {
  const payload: Record<string, string> = { name: values.name.trim() };
  if (values.documentNumber.trim()) payload.documentNumber = values.documentNumber.trim();
  if (values.email.trim()) payload.email = values.email.trim();
  if (values.phone.trim()) payload.phone = values.phone.trim();
  if (values.address.trim()) payload.address = values.address.trim();
  if (values.notes.trim()) payload.notes = values.notes.trim();
  return payload;
}

type CustomerFormTouchedField = "name" | "documentNumber" | "email" | "phone" | "address" | "notes";
type CustomerFormTouched = Partial<Record<CustomerFormTouchedField, boolean>>;

const ALL_CUSTOMER_FIELDS_TOUCHED: CustomerFormTouched = {
  name: true,
  documentNumber: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
};

export type CustomerFormDialogProps = {
  mode: "create" | "edit";
  /** Required when `mode === "edit"`. */
  customer?: CustomerFormDialogCustomer;
  /** Rendered as the dialog's trigger (e.g. a "Crear cliente" or "Editar" button). */
  trigger: ReactElement;
};

export default function CustomerFormDialog({ mode, customer, trigger }: CustomerFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CustomerFormValues>(() => toFormValues(customer));
  const [touched, setTouched] = useState<CustomerFormTouched>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCreate = mode === "create";
  const descriptivePayload = toDescriptivePayload(values);
  const zodValues = isCreate ? descriptivePayload : { ...descriptivePayload, isActive: values.isActive };
  const { errors, isValid } = useZodForm(
    (isCreate ? customerCreateSchema : customerUpdateSchema) as ZodType<unknown>,
    zodValues,
  );

  function updateField<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function markTouched(field: CustomerFormTouchedField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(toFormValues(customer));
      setTouched({});
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(ALL_CUSTOMER_FIELDS_TOUCHED);
    if (!isValid) {
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const url = isCreate ? "/api/customers" : `/api/customers/${customer!.id}`;
      const payload = zodValues;

      const response = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nuevo cliente" : "Editar cliente"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Registra un nuevo cliente para tu negocio."
              : "Actualiza los datos del cliente."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-name">Nombre</Label>
            <Input
              id="customer-name"
              name="name"
              required
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              onBlur={() => markTouched("name")}
              aria-invalid={Boolean(touched.name && errors.name)}
            />
            {touched.name && errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-document">Documento</Label>
            <Input
              id="customer-document"
              name="documentNumber"
              value={values.documentNumber}
              onChange={(event) => updateField("documentNumber", event.target.value)}
              onBlur={() => markTouched("documentNumber")}
              aria-invalid={Boolean(touched.documentNumber && errors.documentNumber)}
            />
            {touched.documentNumber && errors.documentNumber ? (
              <p className="text-xs text-destructive">{errors.documentNumber}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              name="email"
              type="email"
              value={values.email}
              onChange={(event) => updateField("email", event.target.value)}
              onBlur={() => markTouched("email")}
              aria-invalid={Boolean(touched.email && errors.email)}
            />
            {touched.email && errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-phone">Telefono</Label>
            <Input
              id="customer-phone"
              name="phone"
              value={values.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              onBlur={() => markTouched("phone")}
              aria-invalid={Boolean(touched.phone && errors.phone)}
            />
            {touched.phone && errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-address">Direccion</Label>
            <Input
              id="customer-address"
              name="address"
              value={values.address}
              onChange={(event) => updateField("address", event.target.value)}
              onBlur={() => markTouched("address")}
              aria-invalid={Boolean(touched.address && errors.address)}
            />
            {touched.address && errors.address ? <p className="text-xs text-destructive">{errors.address}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-notes">Notas</Label>
            <Textarea
              id="customer-notes"
              name="notes"
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              onBlur={() => markTouched("notes")}
              aria-invalid={Boolean(touched.notes && errors.notes)}
            />
            {touched.notes && errors.notes ? <p className="text-xs text-destructive">{errors.notes}</p> : null}
          </div>
          {mode === "edit" ? (
            <div className="flex items-center gap-2.5">
              <Switch
                id="customer-active"
                checked={values.isActive}
                onCheckedChange={(checked) => updateField("isActive", checked)}
              />
              <Label htmlFor="customer-active">Cliente activo</Label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !isValid} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
