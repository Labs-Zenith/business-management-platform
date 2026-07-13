"use client";

/**
 * Lazy-loaded entry point for the customer create/edit form, matching
 * `invoice-form.tsx`'s split-wrapper pattern (Fase 4 Lane D: dialog -> page
 * conversion). `ssr:false` is only valid inside a Client Component in the
 * App Router — this thin `"use client"` wrapper is what makes that legal,
 * while keeping the actual (heavier) form implementation
 * (`customer-form-content.tsx`) out of the initial/server bundle.
 *
 * Server Components (e.g. `app/(dashboard)/customers/new/page.tsx` and
 * `app/(dashboard)/customers/[id]/edit/page.tsx`) import this file directly
 * — never `customer-form-content.tsx`. Passing the optional `customer` prop
 * switches the underlying form into edit mode (pre-fill + PATCH); see
 * `customer-form-content.tsx`'s doc comment.
 */

import dynamic from "next/dynamic";

const CustomerForm = dynamic(() => import("./customer-form-content"), {
  ssr: false,
});

export type { CustomerFormContentCustomer as CustomerFormCustomer, CustomerFormContentProps as CustomerFormProps } from "./customer-form-content";
export default CustomerForm;
