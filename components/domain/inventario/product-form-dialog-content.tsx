"use client";

/**
 * Actual create/edit product form + dialog implementation, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Products
 * Are Business-Scoped and Editable" requirement and `design.md`'s Dialogs
 * section.
 *
 * Line-for-line analog of `employee-form-dialog-content.tsx`: products are
 * editable (unlike inventory movements, which are append-only), so this
 * dialog supports both `create` and `edit` modes and the `active` toggle
 * mirrors `Employee.active`'s edit-only visibility — a new product is always
 * active by construction (`lib/schemas/product.ts`'s `productCreateSchema`
 * intentionally has no `active` field). Always imported indirectly through
 * `./product-form-dialog.tsx` (`dynamic(..., {ssr: false})`) — never import
 * this file directly from a page.
 *
 * Mutations POST/PATCH `/api/products` directly (the dialog is the
 * client-side mutation boundary); `router.refresh()` re-runs the Inventario
 * page's Server Component fetch afterwards so the Productos table reflects the
 * change.
 *
 * `unitCost` is entered as whole COP pesos (natural UX) and converted to
 * integer cents only at submit time via `lib/money.ts`'s `pesosToCents`,
 * matching `employee-form-dialog-content.tsx`'s money convention.
 *
 * `minStockThreshold` is REMOVED (Wave 1A): low-stock is now a FIXED business
 * rule (`1 <= currentQuantity <= 3`, see `lib/services/inventory-stock.ts`),
 * not a per-product configurable value — there is no "Stock mínimo" field on
 * this form anymore.
 *
 * Live (as-you-type) validation via the shared `useZodForm` hook
 * (`lib/hooks/use-zod-form.ts`) against the SAME domain schema the server
 * enforces (`lib/schemas/product.ts`'s `productCreateSchema`/
 * `productUpdateSchema`) — the create/update variant is picked per `mode`,
 * matching `buildPayload`'s existing create/edit payload-shape split (an
 * empty `sku` is omitted on create, sent as `null` on edit). Messages come
 * straight from the schema (no custom Spanish overrides) — a deliberate
 * "single source of truth" tradeoff, mirroring `employee-form-dialog-content.tsx`'s
 * identical live-validation wiring. Each field only renders its error once
 * `touched` (blurred at least once), and the submit button stays disabled
 * while `!isValid`.
 *
 * "Cantidad" (quantity) is a SEPARATE inline field, not part of the
 * product schema at all (`productCreateSchema`/`productUpdateSchema` are
 * `.strict()` and have no such field) — it is validated locally
 * (`validateCantidad`, a non-negative integer) and, on successful
 * create/update, reconciled against `inventory_movements` via a follow-up
 * `POST /api/inventory-movements` call (the same route the now-removed
 * "Registrar movimiento" dialog used):
 *   - CREATE: if `cantidad > 0`, posts an `in` movement of that quantity
 *     against the just-created product (`note: "Carga inicial"`).
 *   - EDIT: `delta = cantidad - product.currentQuantity`; if `delta !== 0`,
 *     posts an `in` (delta > 0) or `out` (delta < 0) movement of
 *     `Math.abs(delta)` (`note: "Ajuste de inventario"`). `delta === 0` skips
 *     the call entirely.
 * A movement-call failure surfaces through the same inline error UI as a
 * product-save failure, even though the product itself already saved
 * successfully (the dialog stays open so the user sees the error and can
 * retry the quantity adjustment).
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
import { MoneyInput, QuantityInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { pesosToCents } from "@/lib/money";
import { productCreateSchema, productUpdateSchema } from "@/lib/schemas/product";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar el producto. Verifica los datos e intenta de nuevo.";
const CANTIDAD_ERROR_MESSAGE = "Cantidad invalida.";

export type ProductFormDialogProduct = {
  id: string;
  name: string;
  sku: string | null;
  /** Integer minor units (COP cents), per `lib/money.ts`'s convention. */
  unitCost: number;
  active: boolean;
  /** Current stock quantity — seeds the "Cantidad" field's default on edit. */
  currentQuantity: number;
};

type ProductFormValues = {
  name: string;
  sku: string;
  /** Whole COP pesos, as entered by the user (raw string) — converted at submit time. */
  unitCost: string;
  /** Plain integer unit count — NOT money, and NOT part of the product payload (see module doc comment). */
  cantidad: string;
  active: boolean;
};

function toFormValues(product?: ProductFormDialogProduct): ProductFormValues {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    unitCost: product ? String(product.unitCost / 100) : "",
    cantidad: product ? String(product.currentQuantity) : "0",
    active: product?.active ?? true,
  };
}

/**
 * Maps the form's raw string `values` to the exact payload shape/types the
 * domain schema (and the server) expect — reused both to feed `useZodForm`
 * (live validation) and as the actual `fetch` request body, so the two never
 * drift apart. Deliberately excludes `cantidad` — the product schemas are
 * `.strict()` and have no such field; quantity is reconciled separately via
 * `/api/inventory-movements` (see module doc comment).
 */
function buildPayload(mode: "create" | "edit", values: ProductFormValues) {
  const trimmedSku = values.sku.trim();
  const unitCost = pesosToCents(Number(values.unitCost) || 0);
  return mode === "create"
    ? {
        name: values.name.trim(),
        ...(trimmedSku ? { sku: trimmedSku } : {}),
        unitCost,
      }
    : {
        name: values.name.trim(),
        sku: trimmedSku || null,
        unitCost,
        active: values.active,
      };
}

/** Non-negative integer, per the "Cantidad" field's contract — `undefined` when valid. */
function validateCantidad(raw: string): string | undefined {
  if (raw.trim() === "") {
    return CANTIDAD_ERROR_MESSAGE;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? undefined : CANTIDAD_ERROR_MESSAGE;
}

type MovementResponseBody = { error?: { message?: string } } | null;

/** Posts a single reconciling movement to `/api/inventory-movements`; returns an error message, or `null` on success. */
async function postInventoryMovement(payload: {
  productId: string;
  type: "in" | "out";
  quantity: number;
  note: string;
}): Promise<string | null> {
  try {
    const response = await fetch("/api/inventory-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body: MovementResponseBody = await response.json().catch(() => null);
      return body?.error?.message ?? GENERIC_ERROR_MESSAGE;
    }
    return null;
  } catch {
    return GENERIC_ERROR_MESSAGE;
  }
}

type ProductFormTouched = { name?: boolean; unitCost?: boolean; cantidad?: boolean };

export type ProductFormDialogProps = {
  mode: "create" | "edit";
  /** Required when `mode === "edit"`. */
  product?: ProductFormDialogProduct;
  /** Rendered as the dialog's trigger (e.g. a "Nuevo producto" or "Editar" button). */
  trigger: ReactElement;
};

export default function ProductFormDialog({ mode, product, trigger }: ProductFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProductFormValues>(() => toFormValues(product));
  const [touched, setTouched] = useState<ProductFormTouched>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const schema = mode === "create" ? productCreateSchema : productUpdateSchema;
  // Explicit `<unknown>` type argument: TS can't unify the create/update
  // schemas' differing (required vs. optional) output types into a single
  // `T` for `ZodType<T>` inference, and the hook's `errors`/`isValid`
  // return shape doesn't depend on `T` anyway (`values` is already
  // `unknown`), so this sidesteps the inference failure with no runtime
  // behavior change.
  const { errors, isValid } = useZodForm<unknown>(schema, buildPayload(mode, values));
  const cantidadError = validateCantidad(values.cantidad);
  const canSubmit = isValid && !cantidadError;

  function updateField<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function markTouched(field: keyof ProductFormTouched) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(toFormValues(product));
      setTouched({});
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError(null);

    if (!canSubmit) {
      setTouched({ name: true, unitCost: true, cantidad: true });
      return;
    }

    setIsSubmitting(true);

    try {
      const isCreate = mode === "create";
      const url = isCreate ? "/api/products" : `/api/products/${product!.id}`;
      const payload = buildPayload(mode, values);

      const response = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseBody: { data?: { id?: string } } & MovementResponseBody = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        setError(responseBody?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      const cantidad = Number(values.cantidad) || 0;

      if (isCreate) {
        const createdProductId = responseBody?.data?.id;
        if (cantidad > 0 && createdProductId) {
          const movementError = await postInventoryMovement({
            productId: createdProductId,
            type: "in",
            quantity: cantidad,
            note: "Carga inicial",
          });
          if (movementError) {
            setError(movementError);
            return;
          }
        }
      } else {
        const delta = cantidad - product!.currentQuantity;
        if (delta !== 0) {
          const movementError = await postInventoryMovement({
            productId: product!.id,
            type: delta > 0 ? "in" : "out",
            quantity: Math.abs(delta),
            note: "Ajuste de inventario",
          });
          if (movementError) {
            setError(movementError);
            return;
          }
        }
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
          <DialogTitle>{mode === "create" ? "Nuevo producto" : "Editar producto"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Registra un nuevo producto para tu inventario."
              : "Actualiza los datos del producto."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-name">Nombre</Label>
            <Input
              id="product-name"
              name="name"
              required
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              onBlur={() => markTouched("name")}
              aria-invalid={touched.name && !!errors.name}
            />
            {touched.name && errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-sku">Referencia</Label>
            <Input
              id="product-sku"
              name="sku"
              value={values.sku}
              onChange={(event) => updateField("sku", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-unit-cost">Costo unitario</Label>
            <MoneyInput
              id="product-unit-cost"
              name="unitCost"
              required
              value={values.unitCost}
              onChange={(value) => updateField("unitCost", value)}
              onBlur={() => markTouched("unitCost")}
              aria-invalid={touched.unitCost && !!errors.unitCost}
            />
            {touched.unitCost && errors.unitCost ? (
              <p className="text-xs text-destructive">{errors.unitCost}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-cantidad">Cantidad</Label>
            <QuantityInput
              id="product-cantidad"
              name="cantidad"
              required
              value={values.cantidad}
              onChange={(value) => updateField("cantidad", value)}
              onBlur={() => markTouched("cantidad")}
              aria-invalid={touched.cantidad && !!cantidadError}
            />
            {touched.cantidad && cantidadError ? (
              <p className="text-xs text-destructive">{cantidadError}</p>
            ) : null}
          </div>
          {mode === "edit" ? (
            <div className="flex items-center gap-2.5">
              <Switch
                id="product-active"
                checked={values.active}
                onCheckedChange={(checked) => updateField("active", checked)}
              />
              <Label htmlFor="product-active">Producto activo</Label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !canSubmit} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
