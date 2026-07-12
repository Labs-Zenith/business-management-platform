# Business Profile Specification (Read-Only)

## Purpose

Display the authenticated business's basic profile (name, phone, email, address, currency) with no editing capability in this change; editing is explicitly deferred.

## Requirements

### Requirement: Read-Only Business Profile Scoped to Session

The system MUST display only the `businesses` record whose `id` matches the `business_id` resolved from the session. No other business's data may ever be shown.

#### Scenario: Owner views own business profile

- GIVEN an authenticated session with `businessId = B1`
- WHEN the user opens the "Negocio" screen
- THEN the screen shows `B1`'s name, phone, email, address, and currency (COP)

#### Scenario: Attempt to access another business's profile

- GIVEN an authenticated session with `businessId = B1`
- WHEN a request is made for any business id other than `B1` (e.g. via a manipulated route param)
- THEN the system responds as if the resource does not exist (no data leakage) regardless of the requested id

### Requirement: No Mutation Surface

This change MUST NOT introduce `PATCH /api/business` or any business-profile edit form. Business profile is display-only for this MVP scaffold.

#### Scenario: No edit action available

- GIVEN the business profile screen
- WHEN the user looks for an edit affordance
- THEN none exists; no client or server code path accepts a business-profile write

### Requirement: business_id Scoping (RLS-Equivalent)

Business profile retrieval MUST be filtered by `business_id` resolved from the session in the service layer. This mock-layer filter is the functional equivalent of the future RLS policy: "`businesses` can only be read or updated when its `id` matches the profile's `business_id`."

#### Scenario: Service layer enforces business scoping

- GIVEN the mock data-access layer
- WHEN the business-profile service is queried
- THEN it filters by the session's `business_id` even though no database-level RLS exists yet in this mocked change

### Requirement: Per-Business Feature Flags Column

The `businesses` table MUST have an `enabled_features` column (array of feature-key strings, default empty) that future changes (Nomina, Inventario, etc.) use to determine which optional capabilities are enabled for a given business, in addition to the user's role. This change only introduces the column — no feature currently reads it.

#### Scenario: Column exists but ungated

- GIVEN a business row
- WHEN inspected
- THEN it has an `enabled_features` array column, defaulting to empty, with no capability in this change yet consulting it

### Requirement: A Business May Now Have Multiple Members

The 1:1 assumption ("one business = one profile") no longer holds. A business's profile display MUST continue to resolve strictly from `session.businessId` (unchanged from baseline) regardless of how many members that business has — this requirement does not change, it is restated here because the underlying `profiles` table shape changed in this same release (see `role-permissions`/`mock-auth-session` deltas).

#### Scenario: Business profile display unaffected by membership count

- GIVEN a business with 2 members (admin + worker)
- WHEN either member views the "Negocio" screen
- THEN both see the identical business record, scoped by `session.businessId` exactly as before
