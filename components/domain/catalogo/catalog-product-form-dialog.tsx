"use client";

/**
 * Lazy-loaded entry point for the Catálogo create/edit dialog, mirroring
 * `components/domain/inventario/product-form-dialog.tsx`. `react-hook-form`,
 * `@hookform/resolvers` and the form itself (plus its nested
 * `catalog-variant-fields.tsx`) stay out of the initial/server bundle.
 * `ssr:false` is only valid inside a Client Component in the App Router —
 * this thin `"use client"` wrapper is what makes that legal.
 *
 * Server Components import THIS file; never the `-dialog-content` or
 * `-form-content` ones directly.
 */

import dynamic from "next/dynamic";

const CatalogProductFormDialog = dynamic(() => import("./catalog-product-form-dialog-content"), {
  ssr: false,
});

export type { CatalogProductFormDialogProps } from "./catalog-product-form-dialog-content";
export default CatalogProductFormDialog;
