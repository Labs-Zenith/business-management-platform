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

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el movimiento. Verifica los datos e intenta de nuevo.";

type MovementType = "in" | "out";

export type MovementFormDialogProduct = { id: string; name: string };

type MovementFormValues = {
  productId: string;
  type: MovementType;
  /** Plain integer unit count — NOT money. */
  quantity: number;
  note: string;
};

type MovementFormFieldErrors = {
  productId?: string;
  quantity?: string;
};

function defaultValues(products: MovementFormDialogProduct[]): MovementFormValues {
  return {
    productId: products[0]?.id ?? "",
    type: "in",
    quantity: 0,
    note: "",
  };
}

export type MovementFormDialogProps = {
  /** Active products only — populates the product select. */
  products: MovementFormDialogProduct[];
  /** Rendered as the dialog's trigger (e.g. a "Registrar movimiento" button). */
  trigger: ReactElement;
};

export default function MovementFormDialog({ products, trigger }: MovementFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<MovementFormValues>(() => defaultValues(products));
  const [fieldErrors, setFieldErrors] = useState<MovementFormFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof MovementFormValues>(key: K, value: MovementFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(defaultValues(products));
      setFieldErrors({});
      setError(null);
    }
  }

  function validate(): MovementFormFieldErrors {
    const nextFieldErrors: MovementFormFieldErrors = {};
    if (!values.productId) {
      nextFieldErrors.productId = "Producto requerido";
    }
    if (!Number.isInteger(values.quantity) || values.quantity <= 0) {
      nextFieldErrors.quantity = "La cantidad debe ser un entero mayor a 0";
    }
    return nextFieldErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError(null);

    const nextFieldErrors = validate();
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const trimmedNote = values.note.trim();
      const payload = {
        productId: values.productId,
        type: values.type,
        quantity: values.quantity,
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
            <select
              id="movement-product"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              value={values.productId}
              onChange={(event) => updateField("productId", event.target.value)}
            >
              {products.length === 0 ? <option value="">Sin productos activos</option> : null}
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            {fieldErrors.productId ? <p className="text-xs text-destructive">{fieldErrors.productId}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-type">Tipo</Label>
            <select
              id="movement-type"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              value={values.type}
              onChange={(event) => updateField("type", event.target.value as MovementType)}
            >
              <option value="in">Entrada</option>
              <option value="out">Salida</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-quantity">Cantidad</Label>
            <Input
              id="movement-quantity"
              name="quantity"
              type="number"
              min="1"
              step="1"
              required
              value={values.quantity}
              onChange={(event) => updateField("quantity", event.target.valueAsNumber || 0)}
            />
            {fieldErrors.quantity ? <p className="text-xs text-destructive">{fieldErrors.quantity}</p> : null}
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
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
