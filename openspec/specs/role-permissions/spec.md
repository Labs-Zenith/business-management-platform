# Role Permissions Specification

## Purpose

Capability-based authorization built on the multi-business membership model. Maps roles (`admin`, `worker`) to capabilities via `lib/services/permissions.ts`, and guarantees a session can never resolve data for a business the user has no membership in. `canViewPayroll` is enforced end-to-end at the Nomina page and its API routes (see `payroll-management` and `role-based-navigation` capabilities) — no longer mechanism-only.

## Requirements

### Requirement: Membership Table Defines Role Per Business

`profiles` MUST be a membership table keyed by `(user_id, business_id)` with `UNIQUE(user_id, business_id)`. Each row MUST carry exactly one `role` (`admin` or `worker`) for that user in that business. A user MAY hold memberships (with independent roles) in multiple businesses.

#### Scenario: User holds different roles in different businesses

- GIVEN a user has a membership in business A with role `admin` and business B with role `worker`
- WHEN memberships are listed for that user
- THEN two rows are returned, each with its own `business_id` and `role`, and neither role applies to the other business

#### Scenario: Duplicate membership rejected

- GIVEN a membership row already exists for `(user_id, business_id)`
- WHEN an insert attempts the same `(user_id, business_id)` pair again
- THEN the database rejects it via `UNIQUE(user_id, business_id)`

### Requirement: Session Role Reflects the Active Membership

`Session.role` MUST equal the `role` of the membership row for `Session.businessId`, snapshotted at login or switch time. The system MAY accept minor staleness mid-session (no re-check per request); a stale role snapshot self-corrects on the next login or business switch. This is acceptable even now that `canViewPayroll` is an enforced capability, since every capability check reads the same session-snapshotted role as any other role-based decision in the system.
(Previously: staleness was justified by "no capability is gated yet"; that premise no longer holds now that `canViewPayroll` gates Nomina end-to-end.)

#### Scenario: Role snapshot matches membership at issuance

- GIVEN a user's membership in business A has role `worker`
- WHEN a session is issued scoped to business A
- THEN `Session.role` is `worker`, matching the membership row exactly

### Requirement: Capability Check Helper

`lib/services/permissions.ts` MUST expose a capability→role helper (e.g. `canViewPayroll(role)`) that is the single source of truth for role-based checks. Callers MUST NOT compare role strings directly outside this helper.

#### Scenario: Deterministic capability result

- GIVEN a role of `admin` or `worker`
- WHEN a capability helper is called with that role
- THEN it returns a deterministic boolean, with no side effects or DB access

#### Scenario: Unmapped capability denies by default

- GIVEN a capability with no explicit mapping for a given role
- WHEN the helper is evaluated
- THEN it returns `false` (deny by default, never fail open)

### Requirement: Cross-Business Isolation Is Absolute

The system MUST NOT resolve data for any `business_id` the session's `userId` lacks a membership row for. This holds regardless of role, and regardless of what `business_id` a client requests.

#### Scenario: No membership means no access, at any role

- GIVEN a user has a membership only in business A
- WHEN any request (client-supplied `business_id` or otherwise) attempts to resolve data scoped to business B
- THEN the request is denied or treated as not found; business B's data is never returned

#### Scenario: Role does not carry across businesses

- GIVEN a user is `admin` in business A and has no membership in business B
- WHEN the user's session is (hypothetically) scoped to business B
- THEN no `admin` (or any) privilege is granted in B — a role only ever applies to the business its membership row names

#### Scenario: Repositories never trust client-supplied business_id

- GIVEN any repository method that reads or writes tenant-scoped data
- WHEN it executes
- THEN it resolves `business_id` from the session, never from client payloads, query params, or headers

### Requirement: Capability Enforcement at Page and Route Layers

`canViewPayroll` MUST have a real enforced consumer: the Nomina page and its
API routes MUST check the session's capability before serving content. A
session whose role fails `canViewPayroll` MUST be denied — the page responds
not-found (404); each API route responds `FORBIDDEN` (403). This demonstrates
the capability-check pattern working end-to-end, superseding the prior
"no feature is gated yet" state.

#### Scenario: Worker denied at the payroll page

- GIVEN a `worker` session (`canViewPayroll` returns `false`)
- WHEN the worker requests the Nomina page directly
- THEN the response is not-found (404)

#### Scenario: Worker denied at a payroll API route

- GIVEN a `worker` session (`canViewPayroll` returns `false`)
- WHEN the worker requests any payroll API route (employees or payroll
  payments)
- THEN the response is `403 FORBIDDEN`

#### Scenario: Admin granted access

- GIVEN an `admin` session (`canViewPayroll` returns `true`)
- WHEN the admin requests the Nomina page or any payroll API route
- THEN the request is served normally

### Requirement: viewAuditLog Capability Is Admin-Only

`lib/services/permissions.ts` MUST expose a `viewAuditLog` capability with a `canViewAuditLog(role)` helper (or equivalent `can(role, "viewAuditLog")` mapping), mirroring the existing `canViewPayroll` enforcement pattern exactly: only `admin` role resolves `true`; `worker` resolves `false`; any unmapped role denies by default.

#### Scenario: Admin role grants viewAuditLog

- GIVEN a role of `admin`
- WHEN `canViewAuditLog(role)` (or `can(role, "viewAuditLog")`) is evaluated
- THEN it returns `true`

#### Scenario: Worker role denies viewAuditLog

- GIVEN a role of `worker`
- WHEN `canViewAuditLog(role)` (or `can(role, "viewAuditLog")`) is evaluated
- THEN it returns `false`

#### Scenario: viewAuditLog is a widget-level check, not a page-level guard

- GIVEN the `viewAuditLog` capability is used to gate `<MovementsPanel>` on the invoice detail page
- WHEN a `worker` session evaluates `can(role, "viewAuditLog")` at that call site
- THEN the check governs only whether the panel renders; it MUST NOT be used to 404 or otherwise block the invoice detail page itself, unlike the page-level `requireCapabilityOrNotFound` pattern used for `viewPayroll`/Nomina
