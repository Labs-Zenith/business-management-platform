"use client";

/**
 * Lazy-loaded entry point for the Scalar API reference, per the user's
 * explicit lazy-loading requirement (`design.md`'s "Skeleton vs dynamic"
 * section — same pattern as the customer/payment/invoice form dialogs).
 * `ssr:false` is only valid inside a Client Component in the App Router —
 * this thin `"use client"` wrapper is what makes that legal, while keeping
 * Scalar's (heavy) rendering implementation
 * (`api-reference-content.tsx`) out of the initial/server bundle.
 *
 * `app/api/docs/page.tsx` (a Server Component) imports this file directly —
 * never `api-reference-content.tsx`.
 */

import dynamic from "next/dynamic";

const ApiReferenceClient = dynamic(() => import("./api-reference-content"), {
  ssr: false,
});

export default ApiReferenceClient;
