"use client";

/**
 * Lazy-loaded entry point for the Catálogo create/edit form, per
 * `invoices/invoice-form.tsx`'s established split-wrapper pattern:
 * `react-hook-form`/`@hookform/resolvers` and the actual (heavier) form
 * implementation (`catalog-product-form-content.tsx`, plus its nested
 * `catalog-variant-fields.tsx`) stay out of the initial/server bundle.
 * `ssr:false` is only valid inside a Client Component in the App Router —
 * this thin `"use client"` wrapper is what makes that legal.
 *
 * Server Components (`app/(dashboard)/catalogo/new/page.tsx` and
 * `app/(dashboard)/catalogo/[id]/edit/page.tsx`) import this file directly —
 * never `catalog-product-form-content.tsx`. Passing the optional `product`
 * prop switches the underlying form into edit mode (pre-fill + PATCH); see
 * `catalog-product-form-content.tsx`'s doc comment.
 */

import dynamic from "next/dynamic";

const CatalogProductForm = dynamic(() => import("./catalog-product-form-content"), {
  ssr: false,
});

export type {
  CatalogProductFormContentProps as CatalogProductFormProps,
  CatalogProductFormContentProduct,
  CatalogProductFormContentVariant,
  CatalogProductFormContentTier,
} from "./catalog-product-form-content";
export default CatalogProductForm;
