"use client";

/**
 * Lazy-loaded entry point for the product create/edit dialog, per the
 * user's explicit lazy-loading requirement (mirrors `design.md`'s "Skeleton
 * vs dynamic" section from `nomina-payroll`). `ssr:false` is only valid
 * inside a Client Component in the App Router — this thin `"use client"`
 * wrapper is what makes that legal, while keeping the actual (heavier)
 * dialog implementation (`product-form-dialog-content.tsx`) out of the
 * initial/server bundle. Same split-wrapper pattern as
 * `components/domain/nomina/employee-form-dialog.tsx`.
 *
 * Server Components (e.g. `app/(dashboard)/inventario/page.tsx`) import this
 * file directly — never `product-form-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const ProductFormDialog = dynamic(() => import("./product-form-dialog-content"), {
  ssr: false,
});

export type { ProductFormDialogProduct, ProductFormDialogProps } from "./product-form-dialog-content";
export default ProductFormDialog;
