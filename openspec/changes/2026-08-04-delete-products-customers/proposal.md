# Proposal: Delete Products and Customers (admin-only)

## Intent

Neither products nor customers could be removed: both only had an `active`/`isActive` toggle, so a mistyped catalog entry stayed in the list forever. Give admins a real delete, without ever damaging accounting history, and confirm that invoicing decrements stock and blocks at zero.

## Scope

### In Scope

- `DELETE /api/products/{id}` — guarded. Allowed only when zero `invoice_items` reference the product; otherwise `CONFLICT` naming the DISTINCT invoice count. When allowed, its `inventory_movements` are dropped alongside it in one transaction.
- `DELETE /api/customers/{id}` — guarded. Allowed only when zero invoices AND zero payments reference the customer; otherwise `CONFLICT` naming the counts. `pipeline_cards.customer_id` (nullable) is detached in the same transaction.
- New `deleteRecords` capability, `admin` only, enforced on both routes. Creating and editing stay open to every member.
- Confirmation dialog on both list surfaces plus the customer detail header, with the refusal message rendered inline and a "Desactivar" button offered in its place so a refusal is never a dead end.
- Client-side stock affordances on invoice creation: out-of-stock products are labelled "sin stock" and unselectable, and a line claiming more than the available quantity is flagged before submit.

### Out of Scope

- Deleting invoices, payments, expenses or employees.
- Gating the existing pipeline-card delete behind `deleteRecords`.
- Making credit notes return stock instead of consuming it — a pre-existing defect surfaced by this change's review, addressed in its own change: `2026-08-04-credit-note-returns-stock`.

## Multi-tenant / business_id Impact

Both deletes resolve `business_id` from the session only. Every statement is business-scoped and the `FOR UPDATE` lock doubles as the ownership check, so a cross-business id resolves to `NOT_FOUND` — never `CONFLICT`, which would leak existence.

## Rollback Plan

Revert the branch. The accompanying migration only adds two indexes and has a `Down Migration` that drops them; no data is transformed, so a rollback loses nothing beyond the ability to delete.
