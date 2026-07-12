# Role Permissions Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Session Role Reflects the Active Membership

`Session.role` MUST equal the `role` of the membership row for
`Session.businessId`, snapshotted at login or switch time. The system MAY
accept minor staleness mid-session (no re-check per request); a stale role
snapshot self-corrects on the next login or business switch. This is
acceptable even now that `canViewPayroll` is an enforced capability, since
every capability check reads the same session-snapshotted role as any other
role-based decision in the system.
(Previously: staleness was justified by "no capability is gated yet"; that
premise no longer holds now that `canViewPayroll` gates Nomina end-to-end.)

#### Scenario: Role snapshot matches membership at issuance

- GIVEN a user's membership in business A has role `worker`
- WHEN a session is issued scoped to business A
- THEN `Session.role` is `worker`, matching the membership row exactly
