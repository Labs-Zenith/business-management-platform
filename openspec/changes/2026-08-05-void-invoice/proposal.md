# Proposal: Void an Invoice (logical deletion)

## Intent

An invoice created by mistake could not be undone: invoices are never deleted, and editing is locked once one is fully paid. The stock it consumed and the money it counted stayed wrong forever, and the only workaround was to leave a wrong invoice standing.

An admin can now VOID an invoice: it stops counting toward every figure, the stock it moved goes back, and its payments stop counting — so the correct invoice can be issued. The row is never removed.

## Scope

### In Scope

- `POST /api/invoices/{id}/void`, gated on a new admin-only `voidInvoice` capability.
- A persisted `voided_at` marker that OVERRIDES the derived status, plus `voided_by` and a mandatory `void_reason`.
- One transaction: reverse the inventory the lines moved, void the invoice's payments, stamp the marker.
- Voided invoices and their payments excluded from `invoices.list()` / `payments.list()` — the two reads that feed the dashboard, the list pages, the customer balances and the exports.
- A voided invoice is frozen: editing and recording payments both refuse with `CONFLICT`.
- UI: an "Anular factura" action with a mandatory-reason dialog, an "Anulada" badge, the reason shown on the invoice, and "Anulada" added to the status filter.

### Out of Scope

- Un-voiding. The remedy for a mistaken void is a new invoice.
- Voiding a payment on its own, without voiding its invoice.
- Any refund concept: voiding undoes the record, it does not move money.

## Multi-tenant / business_id Impact

`business_id` comes from the session as everywhere else, and every statement in the transaction is business-scoped. A cross-business id resolves to `NOT_FOUND`, never `CONFLICT`, so existence is not revealed. The `FOR UPDATE OF i` lock deliberately excludes the global `invoice_types` catalog.

## Rollback Plan

Revert the branch. The migration only ADDS nullable columns and its `Down Migration` drops them; no data is transformed, so nothing is lost beyond the ability to void.
