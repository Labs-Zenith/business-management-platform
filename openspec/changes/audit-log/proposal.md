# Proposal: Audit Log (MovementsPanel) + Invoice Editing

## Intent

Fase 2 point 9 asks for an admin-only `MovementsPanel` showing the audit history ("crear/editar factura, registrar pago") on the invoice detail page. Exploration found a real gap: invoice **editing does not exist** anywhere (only creation). So this phase builds invoice-edit as a prerequisite, then the append-only audit trail that records those mutations. Today businesses have no visibility into who changed what on an invoice, and cannot correct a mistyped invoice before money is collected.

## Scope

### In Scope
- **Invoice editing** (new): `updateInvoice(session, id, data)` service, `InvoiceRepository.update`, `PATCH /api/invoices/[id]` (session-gated only), and edit-mode support in `invoice-form-content.tsx` reached via an "Editar factura" action on the detail page.
- **Edit-lock business rule**: an invoice is editable ONLY while it has ZERO payments (`balance === total` / `paidAmount === 0`). One payment locks edits forever; `updateInvoice` rejects with a clean error. Only derived fields (status, balance) keep changing after that.
- **Audit log** (new): `1700000005000_add_audit_log.sql` table + `AuditLogEntry`/`AuditLogRepository` (list/create only) + dual-backend repos + `repositories.ts` wiring + `lib/mock/store.ts` Map/fixtures/`?? []` hydration.
- **Instrumentation** (best-effort, fire-and-forget after the main mutation): `invoice_created`, `invoice_updated`, `payment_recorded` — all with `entity_type="invoice"`, `entity_id=<invoiceId>`.
- **Capability** `viewAuditLog` (admin-only) + `<MovementsPanel>` Server Component, gated via plain `can()` at the call site (page stays worker-accessible).

### Out of Scope
- Instrumenting Nomina/Inventario mutations (pattern is ready to extend, not extended here).
- Invoice deletion; partial editing of paid/partially-paid invoices; field-level diffing.
- True same-transaction atomicity for audit inserts (accepted crash-window risk).

## Capabilities

### New Capabilities
- `audit-logging`: append-only audit trail (table, repository, best-effort instrumentation), plus the admin-gated `MovementsPanel` widget on the invoice detail page.

### Modified Capabilities
- `invoices`: adds invoice editing with the zero-payments edit-lock rule (new `update` behavior + PATCH route).
- `role-permissions`: adds the `viewAuditLog` capability (admin-only), mirroring `viewPayroll`.

## Approach

**Resolved design decisions** (from exploration's open questions):
- `detail`: free **TEXT** (human-readable), not JSON — matches this codebase's permissive text-field convention.
- `action`: free **TEXT**, **no CHECK** constraint (extensible); documented initial set `invoice_created`/`invoice_updated`/`payment_recorded`.
- `entity_type`: `"invoice"` for **all** rows (payments included) so the panel query stays `WHERE entity_type='invoice' AND entity_id=:invoiceId`.
- Audit inserts are **best-effort** sequential (after the main mutation), not wrapped in its transaction — avoids reworking `gen_random_uuid()` id minting (payroll-repo's data-independence constraint).

**Invoice edit** mirrors the Customer/Employee/Product editable-entity pattern: sanitize-before-repo, recompute `subtotal`/`total`/`status` server-side, keep `number` immutable, replace items. Repo `update` re-checks zero-payments as defense in depth. `invoice-form-content.tsx` gains an `invoice?` prop that pre-fills values and switches POST→PATCH.

**Audit** follows the Payment/Expense append-only repo shape, dual-backend, with a small shared `recordAuditLog(session, entityType, entityId, action, detail)` helper called inline. `MovementsPanel` mirrors `recent-payments.tsx` (Card + Table + empty state), reading via the service inline (no extra API route).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/services/invoice-service.ts` | Modified | Add `updateInvoice` (zero-payments guard) + instrument create/update |
| `lib/services/payment-service.ts` | Modified | Instrument `createPayment` (`payment_recorded`) |
| `lib/services/ports.ts` | Modified | `InvoiceRepository.update`, `InvoiceUpdate` type, `AuditLogEntry`/`AuditLogRepository` |
| `lib/db/invoice-repo.ts`, `lib/mock/invoice-repo.ts` | Modified | Add `update` implementations |
| `lib/db/audit-log-repo.ts`, `lib/mock/audit-log-repo.ts` | New | Dual-backend audit repos |
| `lib/services/repositories.ts` | Modified | Wire `auditLog` repo |
| `lib/mock/store.ts` | Modified | `auditLogs` Map + fixtures + `?? []` hydration |
| `lib/services/permissions.ts` | Modified | `viewAuditLog` capability + `canViewAuditLog` |
| `lib/services/audit-log-service.ts` | New | `recordAuditLog` + `listAuditLog` |
| `app/api/invoices/[id]/route.ts` | Modified | Add `PATCH` handler |
| `components/domain/invoices/invoice-form-content.tsx` | Modified | Edit-mode support |
| `app/(dashboard)/invoices/[id]/page.tsx` | Modified | "Editar factura" action (zero-payments only) + `<MovementsPanel>` (call-site `can()` gate) |
| `components/domain/audit-log/movements-panel.tsx` | New | Read-only Server Component |
| `migrations/1700000005000_add_audit_log.sql` | New | `audit_log` table |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Widget gate misused as whole-page `requireCapabilityOrNotFound`, 404-ing workers | Med | Use plain `can()` at call site; page stays session-only |
| Missing audit row on crash between mutation and insert | Low | Accepted, documented tradeoff (audit is operational, not money-safety) |
| Edit-lock check bypassed → editing a paid invoice breaks overpay invariant | Low | Guard in both service and repo (defense in depth) |
| Dual-backend: mock side skipped | Med | Both repos + store hydration explicitly in scope |

## Rollback Plan

Revert the change branch; run the migration's `-- Down Migration` (`DROP TABLE audit_log`). No other table is altered, so invoices/payments are untouched. Removing `viewAuditLog` and the PATCH route restores prior behavior with no data migration.

## Dependencies

- Existing `computeStatus`/`withFinance` balance logic (reused for the edit-lock check).
- `roles-multi-business` capability foundation (shipped) for `can()`/`CAPABILITY_ROLES`.

## Success Criteria

- [ ] An invoice with zero payments can be edited; one with any payment rejects edit (service + repo).
- [ ] `invoice_created`, `invoice_updated`, `payment_recorded` rows are written best-effort with `entity_type="invoice"`.
- [ ] Admin sees `<MovementsPanel>` on the invoice detail page; worker sees the page but not the panel.
- [ ] Both mock and Postgres backends implement the new repo methods; mock store hydrates old cookies via `?? []`.
- [ ] Nomina/Inventario remain uninstrumented (explicit non-goal).
