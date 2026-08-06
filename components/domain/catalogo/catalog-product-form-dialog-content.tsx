"use client";

/**
 * The Catálogo create/edit form, wrapped in a dialog.
 *
 * Editing happens in a modal rather than on its own page so the catalog
 * behaves like Inventario, which is the same task from the user's side —
 * see `components/domain/inventario/product-form-dialog-content.tsx`. There
 * are no `/catalogo/new` or `/catalogo/[id]/edit` routes; this component is
 * the only way in, triggered from the list's header, each row's Acciones cell
 * and the detail page.
 *
 * Always imported indirectly through `./catalog-product-form-dialog.tsx`
 * (`dynamic(..., {ssr:false})`) — never from a page directly.
 *
 * WHY IT FETCHES INSTEAD OF TAKING THE PRODUCT AS A PROP: the list renders
 * `CatalogProductSummary` rows, which deliberately carry no variants or price
 * tiers (that is the light-list/heavy-detail split in `lib/services/ports.ts`).
 * Pre-filling an edit needs the full `CatalogProductDetail`, so handing every
 * row its own detail would mean one fetch per row on every page load. Loading
 * it when the dialog actually opens costs one request, only when someone edits.
 *
 * WIDER THAN INVENTARIO'S DIALOG (`sm:max-w-2xl` vs `sm:max-w-md`) because
 * this form grows a lot once "Precio avanzado" is opened: a `variant`/
 * `package` product has a list of options, and a `tiered` one nests a quantity
 * ladder inside each of them. `DialogContent` already caps its height and
 * scrolls (`components/ui/dialog.tsx`), so it stays usable at that size; the
 * simple name-and-price path is unaffected either way.
 */

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import CatalogProductFormContent, {
  type CatalogProductFormContentProduct,
} from "./catalog-product-form-content";

const LOAD_ERROR_MESSAGE = "No se pudo cargar el producto. Cierra e intenta de nuevo.";

export type CatalogProductFormDialogProps = {
  mode: "create" | "edit";
  /** Required when `mode === "edit"` — the full product is fetched on open. */
  productId?: string;
  /** Existing category values for this business — `<datalist>` suggestions on the free-text "Categoría" input. */
  categories: string[];
  /** Rendered as the dialog's trigger (a "Nuevo producto" button, a row's edit icon, …). */
  trigger: ReactElement;
  /**
   * Where to go after a successful save. Omitted on the list, which refreshes
   * in place. A plain string rather than a callback because the callers are
   * Server Components, which cannot pass a closure across the RSC boundary —
   * same reasoning as `delete-customer-button.tsx`'s `redirectTo`.
   */
  redirectTo?: string;
};

export default function CatalogProductFormDialog({
  mode,
  productId,
  categories,
  trigger,
  redirectTo,
}: CatalogProductFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<CatalogProductFormContentProduct | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleOpenChange(nextOpen: boolean): Promise<void> {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Drop the loaded product on close so reopening always re-reads it —
      // another tab, or the row's own delete/deactivate, may have moved on.
      setProduct(null);
      setLoadError(null);
      return;
    }
    if (mode !== "edit" || !productId) {
      return;
    }
    try {
      const response = await fetch(`/api/catalog-products/${productId}`);
      if (!response.ok) {
        setLoadError(LOAD_ERROR_MESSAGE);
        return;
      }
      const body: { data: CatalogProductFormContentProduct } = await response.json();
      setProduct(body.data);
    } catch {
      setLoadError(LOAD_ERROR_MESSAGE);
    }
  }

  function handleSaved(): void {
    setOpen(false);
    setProduct(null);
    if (redirectTo) {
      router.push(redirectTo);
    }
    // Always refresh, including after a push: the Server Component that owns
    // the row (or the detail page) has to re-read what was just saved.
    router.refresh();
  }

  const isEditing = mode === "edit";
  const ready = !isEditing || product !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Actualiza los datos del producto." : "Registra un producto o servicio que vendes."}
          </DialogDescription>
        </DialogHeader>
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : ready ? (
          <CatalogProductFormContent
            categories={categories}
            product={product ?? undefined}
            onSaved={handleSaved}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
