"use client";

/**
 * Business-profile edit form, rendered inline on
 * `app/(dashboard)/settings/page.tsx` (Fase 5 Lane 2: read-only -> editable).
 * Reuses the same plain `useState` + native form + `fetch` PATCH pattern as
 * `components/domain/customers/customer-form-content.tsx`, but stays on the
 * page after a successful submit (an inline success message + `router.refresh()`,
 * matching `payment-form-dialog-content.tsx`'s post-submit `router.refresh()`
 * convention) instead of navigating away — there is nowhere else to navigate
 * to; this IS the destination page.
 *
 * `canEdit` (from `canEditBusinessProfile(session.role)`) gates the editable
 * form: non-admins get a read-only `<dl>` rendering instead (same shape as
 * the original read-only settings page — see `docs/business-rules.md`'s
 * "Negocios" section), with no inputs and no Save button. This is a UX
 * convenience only — the authoritative gate is `updateBusinessProfile`'s
 * server-side `can(session.role, "editBusinessProfile")` check.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar el negocio. Verifica los datos e intenta de nuevo.";
const SUCCESS_MESSAGE = "Cambios guardados.";

export type BusinessProfileFormBusiness = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
};

type BusinessProfileFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
};

function toFormValues(business: BusinessProfileFormBusiness): BusinessProfileFormValues {
  return {
    name: business.name,
    phone: business.phone ?? "",
    email: business.email ?? "",
    address: business.address ?? "",
    currency: business.currency,
  };
}

/** Blank optional strings are omitted entirely (sent as absent, not `""`). `name`/`currency` are always sent (required editable fields). */
function toPayload(values: BusinessProfileFormValues): Record<string, string> {
  const payload: Record<string, string> = {
    name: values.name.trim(),
    currency: values.currency.trim(),
  };
  if (values.phone.trim()) payload.phone = values.phone.trim();
  if (values.email.trim()) payload.email = values.email.trim();
  if (values.address.trim()) payload.address = values.address.trim();
  return payload;
}

export type BusinessProfileFormProps = {
  business: BusinessProfileFormBusiness;
  canEdit: boolean;
};

const READ_ONLY_FIELDS: ReadonlyArray<{ label: string; key: keyof BusinessProfileFormValues }> = [
  { label: "Nombre", key: "name" },
  { label: "Telefono", key: "phone" },
  { label: "Email", key: "email" },
  { label: "Direccion", key: "address" },
  { label: "Moneda", key: "currency" },
];

export default function BusinessProfileForm({ business, canEdit }: BusinessProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<BusinessProfileFormValues>(() => toFormValues(business));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!canEdit) {
    const formValues = toFormValues(business);
    return (
      <dl className="flex flex-col gap-4">
        {READ_ONLY_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{field.label}</dt>
            <dd className="text-sm font-medium">{formValues[field.key] || "-"}</dd>
          </div>
        ))}
      </dl>
    );
  }

  function updateField<K extends keyof BusinessProfileFormValues>(key: K, value: BusinessProfileFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(values)),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-name">Nombre</Label>
        <Input
          id="business-name"
          name="name"
          required
          value={values.name}
          onChange={(event) => updateField("name", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-phone">Telefono</Label>
        <Input
          id="business-phone"
          name="phone"
          value={values.phone}
          onChange={(event) => updateField("phone", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-email">Email</Label>
        <Input
          id="business-email"
          name="email"
          type="email"
          value={values.email}
          onChange={(event) => updateField("email", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-address">Direccion</Label>
        <Input
          id="business-address"
          name="address"
          value={values.address}
          onChange={(event) => updateField("address", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="business-currency">Moneda</Label>
        <Input
          id="business-currency"
          name="currency"
          required
          value={values.currency}
          onChange={(event) => updateField("currency", event.target.value.toUpperCase())}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? <p className="text-sm text-muted-foreground">{SUCCESS_MESSAGE}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-fit">
        {isSubmitting ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
