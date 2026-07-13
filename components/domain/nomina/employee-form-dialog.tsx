"use client";

/**
 * Lazy-loaded entry point for the employee create/edit dialog, per the
 * user's explicit lazy-loading requirement (`design.md`'s "Skeleton vs
 * dynamic" section). `ssr:false` is only valid inside a Client Component in
 * the App Router — this thin `"use client"` wrapper is what makes that
 * legal, while keeping the actual (heavier) dialog implementation
 * (`employee-form-dialog-content.tsx`) out of the initial/server bundle.
 * Same split-wrapper pattern as
 * `components/domain/customers/customer-form-dialog.tsx`.
 *
 * Server Components (e.g. `app/(dashboard)/nomina/page.tsx`) import this
 * file directly — never `employee-form-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const EmployeeFormDialog = dynamic(() => import("./employee-form-dialog-content"), {
  ssr: false,
});

export type { EmployeeFormDialogEmployee, EmployeeFormDialogProps } from "./employee-form-dialog-content";
export default EmployeeFormDialog;
