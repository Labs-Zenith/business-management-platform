"use client";

/**
 * Lazy-loaded entry point for the pipeline card detail/edit/delete dialog,
 * matching `customer-form-dialog.tsx`'s split-wrapper pattern (`ssr:false`
 * is only legal inside a Client Component in the App Router). Always
 * rendered from `pipeline-card.tsx` — never import
 * `card-detail-dialog-content.tsx` directly.
 */

import dynamic from "next/dynamic";

const CardDetailDialog = dynamic(() => import("./card-detail-dialog-content"), {
  ssr: false,
});

export type { CardDetailDialogCustomer, CardDetailDialogProps } from "./card-detail-dialog-content";
export default CardDetailDialog;
