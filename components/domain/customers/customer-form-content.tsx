"use client";

/**
 * Actual customer create/edit form implementation — the PAGE version of the
 * form, mirroring `invoice-form-content.tsx`'s full-page pattern (Fase 4
 * Lane D: dialog -> page conversion, matching how invoices already work).
 * Always imported indirectly through `./customer-form.tsx`
 * (`dynamic(..., {ssr:false})`) — never import this file directly from a
 * page.
 *
 * Reuses the EXACT fields, validation, and submit logic from the original
 * `customer-form-dialog-content.tsx` (plain `useState` + native form, no
 * `react-hook-form`/zod client-side — the server remains authoritative via
 * `lib/schemas/customer.ts`). The only behavioral change is what happens on
 * success: instead of closing a dialog (`setOpen(false)` + `router.refresh()`),
 * this navigates to the customer's detail page (`router.push` +
 * `router.refresh()`), matching `invoice-form-content.tsx`'s post-submit
 * navigation.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar el cliente. Verifica los datos e intenta de nuevo.";

export type CustomerFormContentCustomer = {
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

function toFormValues(customer?: CustomerFormContentCustomer): CustomerFormValues {
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

export type CustomerFormContentProps = {
  /** When present, the form operates in edit mode: pre-fills from this customer and PATCHes instead of POSTing. */
  customer?: CustomerFormContentCustomer;
};

export default function CustomerFormContent({ customer }: CustomerFormContentProps) {
  const router = useRouter();
  const isEditing = Boolean(customer);
  const [values, setValues] = useState<CustomerFormValues>(() => toFormValues(customer));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const url = isEditing ? `/api/customers/${customer!.id}` : "/api/customers";
      const payload = isEditing
        ? { ...toDescriptivePayload(values), isActive: values.isActive }
        : toDescriptivePayload(values);

      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      const body: { data: { id: string } } = await response.json();
      router.push(`/customers/${body.data.id}`);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-2xl flex-col gap-4"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-name">Nombre</Label>
        <Input
          id="customer-name"
          name="name"
          required
          value={values.name}
          onChange={(event) => updateField("name", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-document">Documento</Label>
        <Input
          id="customer-document"
          name="documentNumber"
          value={values.documentNumber}
          onChange={(event) => updateField("documentNumber", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-email">Email</Label>
        <Input
          id="customer-email"
          name="email"
          type="email"
          value={values.email}
          onChange={(event) => updateField("email", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-phone">Telefono</Label>
        <Input
          id="customer-phone"
          name="phone"
          value={values.phone}
          onChange={(event) => updateField("phone", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-address">Direccion</Label>
        <Input
          id="customer-address"
          name="address"
          value={values.address}
          onChange={(event) => updateField("address", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-notes">Notas</Label>
        <Textarea
          id="customer-notes"
          name="notes"
          value={values.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>
      {isEditing ? (
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
      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-fit">
        {isSubmitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear cliente"}
      </Button>
    </form>
  );
}
