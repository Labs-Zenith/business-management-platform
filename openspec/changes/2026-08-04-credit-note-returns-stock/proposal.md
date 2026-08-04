# Proposal: A Credit Note Returns Stock Instead of Consuming It

## Intent

`invoice_types` has carried `nota_credito` since the catalogs change, but the movement direction was hardcoded `'out'`, so recording a return SUBTRACTED the returned goods a second time. Returning 2 units of a product left the shelf 2 lower instead of 2 higher.

## Scope

### In Scope

- Movement direction resolved from the invoice type's catalog `code`: `nota_credito` emits `in`, every other type emits `out`.
- The floor-at-zero guard becomes direction-specific: only an `out` can underflow, so a credit note is never refused for insufficient stock.
- Editing flips both sides: a sale reverses with `in` and re-applies `out`; a credit note reverses with `out` (guarded — the returned units may already have been re-sold) and re-applies `in`.
- The rule lives in one shared helper (`lib/services/inventory-stock.ts#movementDirectionFor`) used by BOTH invoice repos, so they cannot drift.

### Out of Scope

- Linking a credit note to the original invoice it corrects (there is no `related_invoice_id` column, and none is added).
- Any change to how a credit note affects receivables — it is still an invoice with its own total and balance.
- `nota_debito`: deliberately unchanged, still `out`. A debit note bills MORE (an extra charge or an additional shipment), never less.

## Multi-tenant / business_id Impact

None beyond the existing scoping: the direction is derived from a global read-only catalog, and every movement insert stays scoped by `business_id`. The invoice-type lookup in `update` uses `FOR UPDATE OF i` so the shared `invoice_types` catalog is never locked by a per-business edit.

## Rollback Plan

Revert the branch. No migration and no data transformation — movements already written keep their recorded direction.
