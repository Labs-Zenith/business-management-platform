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
 * page's Server Component fetch afterwards so the Productos tab reflects the
 * change.
 *
 * `unitCost` is entered as whole COP pesos (natural UX) and converted to
 * integer cents only at submit time via `lib/money.ts`'s `pesosToCents`,
 * matching `employee-form-dialog-content.tsx`'s money convention.
 * `minStockThreshold` is a PLAIN integer unit count — it never goes through
 * `pesosToCents`.
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
import { pesosToCents } from "@/lib/money";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar el producto. Verifica los datos e intenta de nuevo.";

export type ProductFormDialogProduct = {
  id: string;
  name: string;
  sku: string | null;
  /** Integer minor units (COP cents), per `lib/money.ts`'s convention. */
  unitCost: number;
  /** Plain integer unit count — NOT money. */
  minStockThreshold: number;
  active: boolean;
};

type ProductFormValues = {
  name: string;
  sku: string;
  /** Whole COP pesos, as entered by the user (raw string) — converted at submit time. */
  unitCost: string;
  /** Plain integer unit count (raw string) — NOT money. */
  minStockThreshold: string;
  active: boolean;
};

type ProductFormFieldErrors = {
  unitCost?: string;
};

function toFormValues(product?: ProductFormDialogProduct): ProductFormValues {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    unitCost: product ? String(product.unitCost / 100) : "",
    minStockThreshold: String(product?.minStockThreshold ?? ""),
    active: product?.active ?? true,
  };
}

function validate(values: ProductFormValues): ProductFormFieldErrors {
  const nextFieldErrors: ProductFormFieldErrors = {};
  if (values.unitCost === "" || Number(values.unitCost) <= 0) {
    nextFieldErrors.unitCost = "El costo debe ser mayor a 0";
  }
  return nextFieldErrors;
}

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
  const [fieldErrors, setFieldErrors] = useState<ProductFormFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(toFormValues(product));
      setFieldErrors({});
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError(null);

    const nextFieldErrors = validate(values);
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const isCreate = mode === "create";
      const url = isCreate ? "/api/products" : `/api/products/${product!.id}`;
      const trimmedSku = values.sku.trim();
      const unitCost = pesosToCents(Number(values.unitCost) || 0);
      const minStockThreshold = Number(values.minStockThreshold) || 0;
      const payload = isCreate
        ? {
            name: values.name.trim(),
            ...(trimmedSku ? { sku: trimmedSku } : {}),
            unitCost,
            minStockThreshold,
          }
        : {
            name: values.name.trim(),
            sku: trimmedSku || null,
            unitCost,
            minStockThreshold,
            active: values.active,
          };

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
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-sku">SKU</Label>
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
            />
            {fieldErrors.unitCost ? <p className="text-xs text-destructive">{fieldErrors.unitCost}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-min-stock-threshold">Stock minimo</Label>
            <QuantityInput
              id="product-min-stock-threshold"
              name="minStockThreshold"
              required
              value={values.minStockThreshold}
              onChange={(value) => updateField("minStockThreshold", value)}
            />
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
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
