# Role Permissions Specification

## Purpose

Capability-based authorization built on the multi-business membership model. Maps roles (`admin`, `worker`) to capabilities via `lib/services/permissions.ts`, and guarantees a session can never resolve data for a business the user has no membership in. Mechanism only — no feature is gated yet.

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

`Session.role` MUST equal the `role` of the membership row for `Session.businessId`, snapshotted at login or switch time. The system MAY accept minor staleness mid-session (no re-check per request) since no capability is gated yet.

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
