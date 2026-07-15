"use client";

/**
 * Actual "Registrar movimiento" dialog implementation, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s
 * "Inventory Movements Are Business-Scoped and Append-Only", "Positive
 * Integer Movement Quantity", "Floor-at-Zero Atomic Guard on Out Movements",
 * and "Movement-Recording UI Offers Active Products Only" requirements.
 * Inventory movements are append-only — create only, no edit — so unlike the
 * product dialog there is no `mode` prop. Always imported indirectly through
 * `./movement-form-dialog.tsx` (`dynamic(..., {ssr: false})`) — never import
 * this file directly from a page.
 *
 * Closest analog is `payroll-payment-form-dialog-content.tsx` (a
 * money-entry + entity-select dialog), but deliberately simpler: unlike a
 * payroll payment's server-derived period range, a movement has no
 * derived/previewed field, so this dialog uses plain `useState` (mirroring
 * `employee-form-dialog-content.tsx`'s simplicity) instead of
 * react-hook-form + zod. `quantity` is a PLAIN integer unit count — it never
 * goes through `pesosToCents`.
 *
 * The product select only ever receives ACTIVE products from the caller
 * (`app/(dashboard)/inventario/page.tsx` pre-filters, mirroring Nomina's
 * `activeEmployees` pattern) — this dialog does no additional filtering
 * itself.
 *
 * POSTs directly to `/api/inventory-movements` (the dialog is the
 * client-side mutation boundary); on success, closes the dialog and calls
 * `router.refresh()` so the Inventario page's Productos AND Movimientos tabs
 * re-stream with the new computed stock / history row. A floor-at-zero
 * rejection (`VALIDATION_ERROR` from the repository) surfaces here exactly
 * like any other server error — the server's message is displayed verbatim,
 * never re-translated client-side, matching every other dialog's error
 * convention in this codebase.
 *
 * LIVE (as-you-type) validation is layered on top via the shared
 * `useZodForm` hook (`lib/hooks/use-zod-form.ts`), fed the SAME shape the
 * submit payload already builds — `lib/schemas/inventory-movement.ts`
 * (`inventoryMovementCreateSchema`) is the single source of truth for both
 * the inline client errors and the server's own `safeParse`, replacing the
 * previous submit-time-only manual `validate()`/`fieldErrors` pair. Each
 * field only shows its error once `touched` (via `onBlur`/select-close, or
 * "touch all" on a submit attempt), so a pristine dialog never opens already
 * showing errors. The submit button stays disabled while `!isValid`, in
 * addition to the existing `isSubmitting` guard.
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
import { Label } from "@/components/ui/label";
import { QuantityInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { inventoryMovementCreateSchema } from "@/lib/schemas/inventory-movement";

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el movimiento. Verifica los datos e intenta de nuevo.";

type MovementType = "in" | "out";

export type MovementFormDialogProduct = { id: string; name: string };

/** Minimal shape this dialog needs for the "Tipo" dropdown — a subset of `CatalogItem` (`lib/services/ports.ts`). */
export type MovementFormDialogMovementType = { id: string; code: string; label: string };

type MovementFormValues = {
  productId: string;
  type: MovementType;
  /** Plain integer unit count — NOT money. Raw string from `QuantityInput` ("" when empty). */
  quantity: string;
  note: string;
};

type MovementFormTouchedField = "productId" | "type" | "quantity";
type MovementFormTouched = Partial<Record<MovementFormTouchedField, boolean>>;

const ALL_MOVEMENT_FIELDS_TOUCHED: MovementFormTouched = {
  productId: true,
  type: true,
  quantity: true,
};

function defaultValues(products: MovementFormDialogProduct[]): MovementFormValues {
  return {
    productId: products[0]?.id ?? "",
    type: "in",
    quantity: "",
    note: "",
  };
}

export type MovementFormDialogProps = {
  /** Active products only — populates the product select. */
  products: MovementFormDialogProduct[];
  /** Sources the "Tipo" dropdown — passed from the Server Component page via `catalog-service#listMovementTypes`. */
  movementTypes: MovementFormDialogMovementType[];
  /** Rendered as the dialog's trigger (e.g. a "Registrar movimiento" button). */
  trigger: ReactElement;
};

export default function MovementFormDialog({ products, movementTypes, trigger }: MovementFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<MovementFormValues>(() => defaultValues(products));
  const [touched, setTouched] = useState<MovementFormTouched>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { errors, isValid } = useZodForm(inventoryMovementCreateSchema, {
    productId: values.productId,
    type: values.type,
    quantity: Number(values.quantity) || 0,
    ...(values.note.trim() ? { note: values.note.trim() } : {}),
  });

  function updateField<K extends keyof MovementFormValues>(key: K, value: MovementFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function markTouched(field: MovementFormTouchedField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(defaultValues(products));
      setTouched({});
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setTouched(ALL_MOVEMENT_FIELDS_TOUCHED);
    if (!isValid) {
      return;
    }
    setError(null);

    setIsSubmitting(true);
    try {
      const trimmedNote = values.note.trim();
      const typeId = movementTypes.find((type) => type.code === values.type)?.id;
      const payload = {
        productId: values.productId,
        type: values.type,
        quantity: Number(values.quantity) || 0,
        ...(typeId ? { typeId } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      };

      const response = await fetch("/api/inventory-movements", {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>Registra una entrada o salida de stock para un producto.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-product">Producto</Label>
            <Select
              items={products.map((product) => ({ value: product.id, label: product.name }))}
              value={values.productId}
              onValueChange={(value) => updateField("productId", value ?? "")}
              onOpenChange={(nextOpenSelect) => {
                if (!nextOpenSelect) markTouched("productId");
              }}
            >
              <SelectTrigger id="movement-product" className="h-9 w-full">
                <SelectValue placeholder="Selecciona un producto" />
              </SelectTrigger>
              <SelectContent>
                {products.length === 0 ? (
                  <SelectItem value="" disabled>
                    Sin productos activos
                  </SelectItem>
                ) : null}
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched.productId && errors.productId ? (
              <p className="text-xs text-destructive">{errors.productId}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-type">Tipo</Label>
            <Select
              items={movementTypes.map((type) => ({ value: type.code, label: type.label }))}
              value={values.type}
              onValueChange={(value) => updateField("type", (value ?? "in") as MovementType)}
              onOpenChange={(nextOpenSelect) => {
                if (!nextOpenSelect) markTouched("type");
              }}
            >
              <SelectTrigger id="movement-type" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {movementTypes.map((type) => (
                  <SelectItem key={type.id} value={type.code}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-quantity">Cantidad</Label>
            <QuantityInput
              id="movement-quantity"
              name="quantity"
              required
              value={values.quantity}
              onChange={(value) => updateField("quantity", value)}
              onBlur={() => markTouched("quantity")}
              aria-invalid={Boolean(touched.quantity && errors.quantity)}
            />
            {touched.quantity && errors.quantity ? (
              <p className="text-xs text-destructive">{errors.quantity}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-note">Nota</Label>
            <Textarea
              id="movement-note"
              value={values.note}
              onChange={(event) => updateField("note", event.target.value)}
            />
          </div>
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
