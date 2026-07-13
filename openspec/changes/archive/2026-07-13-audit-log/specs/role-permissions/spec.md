# Delta for Role Permissions

## ADDED Requirements

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
