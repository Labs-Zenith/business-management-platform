# Audit Logging Specification

## Purpose

Append-only, business-scoped audit trail recording invoice mutations (creation, editing, payment registration), surfaced to admins via an admin-only `<MovementsPanel>` widget on the invoice detail page.

## Requirements

### Requirement: Audit Log Rows Are Business-Scoped and Append-Only

Every `audit_log` row MUST carry a `business_id` resolved from the session, never from client input. The system MUST NOT expose any update or delete operation for `audit_log` rows — only insert and read/list.

#### Scenario: Row scoped to the acting session's business

- GIVEN an authenticated session for business B1
- WHEN an audit row is written as a result of a mutation
- THEN the row's `business_id` is B1, derived from the session, not from any client payload

#### Scenario: No update or delete surface exists

- GIVEN the `AuditLogRepository` and its service layer
- WHEN its available operations are enumerated
- THEN only insert (`create`) and read (`list`) are exposed; no update or delete method exists

### Requirement: `entity_type` and `action` Are Free Text by Design

`entity_type` and `action` MUST be stored as free TEXT columns with no `CHECK` constraint enforcing a fixed enum. This is an intentional extensibility choice: future phases MAY instrument additional entities/actions without a migration.

#### Scenario: Unrecognized action value is accepted

- GIVEN a future caller inserts an audit row with `action = "employee_created"` and `entity_type = "employee"` (values not used by this phase's instrumentation)
- WHEN the insert executes
- THEN it succeeds; no `CHECK` constraint rejects it

### Requirement: Audit Inserts Are Best-Effort, Not Transactional With Their Triggering Mutation

Audit log inserts MUST execute after the triggering mutation has already committed successfully, and MUST NOT be wrapped in the same atomic transaction as that mutation. A failure to write the audit row MUST NOT roll back, fail, or otherwise affect the outcome of the triggering mutation. This is an accepted, documented limitation: a crash between the mutation's commit and the audit insert can leave a mutation with no corresponding audit row.

#### Scenario: Audit insert failure does not affect the mutation

- GIVEN an invoice creation that succeeds and commits
- WHEN the subsequent best-effort audit insert fails (e.g. transient error)
- THEN the invoice remains created; the API response still reflects success; the missing audit row is the only consequence

#### Scenario: Crash window can produce a mutation with no audit row

- GIVEN a payment is recorded and commits successfully
- WHEN the process crashes before the best-effort audit insert executes
- THEN the payment persists with no corresponding `audit_log` row; this is an accepted operational gap, not a data-integrity defect

### Requirement: Instrumented Events for This Phase

This phase MUST instrument exactly three events, all with `entity_type = "invoice"`: `invoice_created` (after `createInvoice` succeeds), `invoice_updated` (after `updateInvoice` succeeds), and `payment_recorded` (after a payment is registered against an invoice). Each row MUST set `entity_id` to the affected invoice's id. No other mutation (Nomina, Inventario, or any other domain) is instrumented in this phase.

#### Scenario: Invoice creation is instrumented

- GIVEN a session creates a new invoice successfully
- WHEN the creation completes
- THEN an `audit_log` row is written with `action = "invoice_created"`, `entity_type = "invoice"`, `entity_id` equal to the new invoice's id

#### Scenario: Invoice edit is instrumented

- GIVEN a session successfully edits an editable (zero-payment) invoice
- WHEN the update completes
- THEN an `audit_log` row is written with `action = "invoice_updated"`, `entity_type = "invoice"`, `entity_id` equal to the invoice's id

#### Scenario: Payment registration is instrumented

- GIVEN a session successfully registers a payment against an invoice
- WHEN the payment completes
- THEN an `audit_log` row is written with `action = "payment_recorded"`, `entity_type = "invoice"`, `entity_id` equal to the invoice's id

#### Scenario: Other domains remain uninstrumented

- GIVEN a mutation in Nomina (payroll) or Inventario
- WHEN it executes
- THEN no `audit_log` row is written for it in this phase

### Requirement: MovementsPanel Is a Widget-Level Gate, Not a Page-Level Gate

The `<MovementsPanel>` component MUST be rendered only when `can(session.role, "viewAuditLog")` evaluates true, checked at the component's call site on the invoice detail page. This MUST be a call-site conditional render, not a page-level `requireCapabilityOrNotFound`-style guard: the invoice detail page itself MUST remain reachable and functional for `worker` sessions, with only the panel withheld.

#### Scenario: Admin sees the panel

- GIVEN an `admin` session (`can(role, "viewAuditLog")` is `true`)
- WHEN the admin opens an invoice detail page
- THEN `<MovementsPanel>` renders with that invoice's audit history

#### Scenario: Worker sees the page but not the panel

- GIVEN a `worker` session (`can(role, "viewAuditLog")` is `false`)
- WHEN the worker opens the same invoice detail page
- THEN the page renders normally (200, full invoice detail) and `<MovementsPanel>` is simply not rendered — the page is NOT 404'd or blocked

#### Scenario: Panel query stays scoped to the invoice and business

- GIVEN an admin viewing invoice X's detail page
- WHEN `<MovementsPanel>` fetches its rows
- THEN it reads only rows where `entity_type = "invoice"`, `entity_id = X`, and `business_id` matches the session
