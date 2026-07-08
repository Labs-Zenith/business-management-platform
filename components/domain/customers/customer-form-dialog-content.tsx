"use client";

/**
 * Actual create/edit customer form + dialog implementation. Always imported
 * indirectly through `./customer-form-dialog.tsx` (`dynamic(..., {ssr:
 * false})`) — never import this file directly from a page, per the user's
 * explicit lazy-loading requirement for form dialogs
 * (`openspec/changes/mocked-mvp-scaffold/design.md`'s "Skeleton vs dynamic"
 * section).
 *
 * Mutations POST/PATCH the API routes directly (not through the Server
 * Component's `customer-service` call) — the dialog is the client-side
 * mutation boundary; `router.refresh()` re-runs the Server Component's data
 * fetch afterwards so the list/detail page reflects the change.
 *
 * Uses plain `useState` + native form, matching `app/(auth)/login/page.tsx`'s
 * established pattern — no `react-hook-form`/shadcn `Form` is installed
 * (out of scope for a handful of text fields).
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(toFormValues(customer));
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const isCreate = mode === "create";
      const url = isCreate ? "/api/customers" : `/api/customers/${customer!.id}`;
      const payload = isCreate
        ? toDescriptivePayload(values)
        : { ...toDescriptivePayload(values), isActive: values.isActive };

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Crear cliente" : "Editar cliente"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Registra un nuevo cliente para tu negocio."
              : "Actualiza los datos descriptivos del cliente."}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
