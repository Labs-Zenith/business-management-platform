# Design: Audit Log (MovementsPanel) + Invoice Editing

## Technical Approach

Two coupled capabilities on the existing ports-and-adapters seam. (1) **Invoice editing**: a new `updateInvoice` service + `InvoiceRepository.update` in both backends, gated by a zero-payments edit-lock enforced at BOTH the service layer (reusing the read-path finance math) and the repository layer (atomic, race-closing). (2) **Append-only audit log**: a new table + `AuditLogRepository` (list/create) + best-effort, fire-and-forget instrumentation in three service mutations, surfaced by an admin-gated `<MovementsPanel>` Server Component. Every new piece mirrors an existing sibling (Customer/Product edit pattern, Expense append-only repo, `recent-payments.tsx` panel, `viewPayroll` capability).

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Edit-lock serialization point | Postgres: guarded `UPDATE ... WHERE NOT EXISTS(payments)` + add `FOR UPDATE` to the payment CTE's invoice read. Mock: `withLock(invoiceId)` shared with payment create. | Service-only check; SERIALIZABLE isolation | Both writers must contend on the SAME invoice row lock, else edit+first-payment interleave breaks the overpay invariant. |
| Audit insert transactionality | Best-effort, sequential, after the parent mutation; swallow-and-log on failure | Same-transaction insert | Keeps `gen_random_uuid()` id minting independent; audit is operational, not money-safety. Parent mutation must never fail on audit error. |
| `entity_type` value | `"invoice"` for ALL rows (payments included) | per-type values | Panel query stays `WHERE entity_type='invoice' AND entity_id=:id`. |
| `detail`/`action` columns | free TEXT, NO CHECK constraint | JSON / enum CHECK | Matches this codebase's permissive text convention; action set stays extensible. |
| Panel gate | plain `can(role,"viewAuditLog")` at call site | `requireCapabilityOrNotFound` | Widget-level gate; the page stays worker-accessible (404-ing the whole page is wrong). |
| Edit-lock reject code | `ApiError("CONFLICT", ...)` (409) | VALIDATION_ERROR | Semantically a state conflict, not bad input. |

## Edit-Lock Race Mechanism (highest-stakes surface)

**Service** (`updateInvoice`): resolve via `getInvoice` (`getById` → `withFinance` → `computeStatus`), then reject if `invoice.paidAmount !== 0`. This reuses the exact read-path derivation — NO independent re-summing of payments.

**Repository (defense in depth, atomic):**

- **Postgres** — pre-SELECT for existence/business scope (null → `NOT_FOUND`); then a guarded header UPDATE:

  ```sql
  UPDATE invoices SET customer_id=..., issue_date=..., due_date=...,
    subtotal=..., total=..., status=..., notes=..., updated_at=now()
  WHERE id = ${id} AND business_id = ${businessId}
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = invoices.id)
  RETURNING id
  ```
  Zero rows AND pre-SELECT found it → throw `CONFLICT` (payment-locked). Items are replaced (`DELETE FROM invoice_items WHERE invoice_id=$id` + re-INSERT) only after the guarded UPDATE returns a row. **The payment CTE (`db/payment-repo.ts`) gains `FOR UPDATE` on its `invoices i` read** so both writers serialize on the invoice row: edit-first → payment blocks, re-reads new total; payment-first → edit's `NOT EXISTS` sees the row, rejects. No ordering yields both a committed payment and a committed edit.

- **Mock** — run `update` inside `withLock(invoiceId)` (SAME key `payment-repo.ts` uses). Inside the lock: if `paymentsForInvoice(store,id).length > 0` → throw `CONFLICT`; else replace items + header. Shared lock key gives the identical guarantee.

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/1700000005000_add_audit_log.sql` | Create | `audit_log` table + index |
| `lib/services/ports.ts` | Modify | `InvoiceUpdate`, `InvoiceRepository.update`; `AuditLogEntry`/`AuditLogCreate`/`AuditLogRepository` |
| `lib/db/invoice-repo.ts`, `lib/mock/invoice-repo.ts` | Modify | `update` (guarded) |
| `lib/db/payment-repo.ts` | Modify | Add `FOR UPDATE` to payment CTE's invoice read |
| `lib/db/audit-log-repo.ts`, `lib/mock/audit-log-repo.ts` | Create | Dual-backend append-only repos |
| `lib/services/audit-log-service.ts` | Create | `recordAuditLog` (best-effort) + `listAuditLog` |
| `lib/services/invoice-service.ts` | Modify | `updateInvoice` + instrument create/update |
| `lib/services/payment-service.ts` | Modify | Instrument `payment_recorded` |
| `lib/services/repositories.ts` | Modify | Wire `auditLog` |
| `lib/mock/store.ts` | Modify | `auditLogs` Map + serialize/clear/hydrate (`?? []`) |
| `lib/mock/fixtures/index.ts` | Modify | (optional) seed a few audit rows |
| `lib/services/permissions.ts` | Modify | `viewAuditLog` capability + `canViewAuditLog` |
| `app/api/invoices/[id]/route.ts` | Modify | Add `PATCH` (`requireSession` + `checkOrigin`, no capability gate) |
| `components/domain/invoices/invoice-form-content.tsx` | Modify | `invoice?` prop: pre-fill + POST→PATCH, button label |
| `app/(dashboard)/invoices/[id]/page.tsx` | Modify | "Editar factura" (only when `paidAmount===0`) + `<MovementsPanel>` behind `can()` |
| `components/domain/audit-log/movements-panel.tsx` | Create | Read-only Server Component |

## Interfaces / Contracts

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(business_id, entity_type, entity_id);
-- Down: DROP TABLE IF EXISTS audit_log CASCADE;
```

```ts
export type AuditLogEntry = { id: string; businessId: string; entityType: string;
  entityId: string; action: string; actorUserId: string; detail: string | null; createdAt: string; };
export type AuditLogCreate = { entityType: string; entityId: string; action: string;
  actorUserId: string; detail?: string | null; };
export interface AuditLogRepository {
  list(businessId: string, entityType: string, entityId: string): Promise<AuditLogEntry[]>; // created_at DESC
  create(businessId: string, data: AuditLogCreate): Promise<AuditLogEntry>;
}
export type InvoiceUpdate = { customerId: string; issueDate: string; dueDate?: string | null;
  items: InvoiceItemInput[]; notes?: string | null; }; // number is immutable, never accepted
InvoiceRepository.update(businessId, id, data: InvoicePersist): Promise<InvoiceDetail | null>;
```

`recordAuditLog(session, entityType, entityId, action, detail?)`: wraps `repositories.auditLog.create` in try/catch; on failure `console.error` and return — NEVER rethrow (parent mutation already succeeded). Called after `createInvoice` (`invoice_created`), `updateInvoice` (`invoice_updated`), `createPayment` (`payment_recorded`), all with `entityType="invoice"`, `entityId=<invoiceId>`, `actorUserId=session.userId`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | edit-lock rejects when `paidAmount>0`; allows at 0; `number` immutable; sanitize strips forged fields | service tests vs mock store |
| Unit | `recordAuditLog` failure does NOT throw; parent result unchanged | mock repo whose `create` throws |
| Integration | mock `update` under `withLock` rejects concurrent-payment interleave; store `?? []` hydrates old cookies | store snapshot before/after |
| Integration | PATCH: session-gated (401 anon), CONFLICT on paid invoice, cross-business → NOT_FOUND | route handler |
| Component | worker sees page but not panel; admin sees panel; empty-state renders | RTL |

## Migration / Rollout

Additive migration; no existing table altered. Rollback = revert branch + `DROP TABLE audit_log`. `?? []` store hydration keeps pre-change cookies valid.

## Open Questions

- [x] **RESOLVED during PR1 apply** — a single-statement `FOR UPDATE` added only to the payment CTE (this document's original proposal above) is **NOT sufficient**; empirically proven broken. The shipped fix is a **two-statement `sql.transaction()`** on BOTH `lib/db/invoice-repo.ts#update` and `lib/db/payment-repo.ts#createForInvoice`, mirroring `lib/db/inventory-repo.ts`'s already-proven pattern from this session's `inventario` change.

  **Why the original proposal (single-statement `FOR UPDATE` on the payment CTE only) fails**: reproduced 3/3 against a real Postgres 16 container — when the payment transaction (holding `FOR UPDATE` on `invoices`) never itself modifies the `invoices` row (it only inserts into the sibling `payments` table), a blocked concurrent edit's plain `UPDATE ... WHERE ... AND NOT EXISTS(payments)` has nothing for Postgres's EvalPlanQual to reconcile once unblocked — the `invoices` tuple never changed, so the edit proceeds using its pre-lock-wait snapshot, including a stale `NOT EXISTS(payments)` result. Result: both the edit and the payment committed in the same race window, violating the "one payment locks edits forever" invariant. This is a DIFFERENT structural cause than `inventario`'s disproven single-CTE fix (which locked the SAME row it read the correlated aggregate from), but leads to the same class of failure.

  **The shipped two-statement fix**: statement 1 on either writer (`SELECT id ... FOR UPDATE`) unconditionally acquires the invoice row lock before any `payments`-table read happens in that transaction. Whichever writer starts first holds the lock through both its statements; the other writer's own statement 1 blocks until the first commits, then its statement 2 (a brand-new statement under READ COMMITTED) takes a fresh snapshot that correctly reflects what the first transaction committed.

  **Empirical evidence** (real Postgres 16 container, Docker, two genuinely concurrent `pg` connections, deterministic hold-open-then-release technique mirroring `inventory-repo.ts`'s verified methodology):
  | Configuration | Runs | Result |
  |---|---|---|
  | Baseline (no lock at all) | 6 (3 payment-first + 3 edit-first/downward-edit) | BROKEN 6/6 |
  | Single-statement `FOR UPDATE` on payment CTE only | 3 (payment-first) | BROKEN 3/3 |
  | Two-statement fix on both writers | 10 (5 payment-first + 5 edit-first/downward-edit) | CORRECT 10/10 |

  See `lib/db/payment-repo.ts`'s and `lib/db/invoice-repo.ts#update`'s file-level doc comments for the full methodology and per-statement rationale. The shared mechanism note now lives once in `lib/db/client.ts`'s `runTransaction` helper; the per-repo comments carry only their file-specific statement/column/run-count details and point there.

  **Re-runnable proof (committed):** the originally-manual verification is now a committed, re-runnable integration test at `lib/db/invoice-payment-concurrency.integration.test.ts`. It reproduces both orderings (payment-first and downward-edit-first) against a REAL Postgres 16 container using two `pg` connections and a deterministic hold-open-then-release overlap (polling `pg_stat_activity` until the second writer genuinely blocks on the invoice row lock), asserting exactly one writer ever commits and the invoice ends consistent (totals match items, balance never negative).

  It is **intentionally excluded from the default `npm test` / CI run** — this repo has no standing test-DB infrastructure and CI/sandbox environments may lack Docker. The whole suite is gated behind `describe.skipIf(!process.env.RUN_DB_INTEGRATION_TESTS)` (collected but skipped by default; `pg` is imported only inside `beforeAll`, which does not run when skipped). To run it manually:

  ```sh
  docker run --rm -d --name bmp-pg-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
  RUN_DB_INTEGRATION_TESTS=1 \
    TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres \
    npx vitest run lib/db/invoice-payment-concurrency.integration.test.ts
  docker rm -f bmp-pg-test
  ```

  Latest local result: **PASS**, 2/2 tests (5 payment-first + 5 edit-first iterations each), deterministic across repeated runs, against Postgres 16 in Docker.
