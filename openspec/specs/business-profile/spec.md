# Business Profile Specification

## Purpose

Display AND allow editing of the authenticated business's basic profile (name, phone, email, address, currency). Editing was previously deferred (read-only MVP scaffold); this is no longer the case — see "Editable Business Profile" below.

## Requirements

### Requirement: Business Profile Scoped to Session

The system MUST display and update only the `businesses` record whose `id` matches the `business_id` resolved from the session. No other business's data may ever be shown or mutated.

#### Scenario: Owner views own business profile

- GIVEN an authenticated session with `businessId = B1`
- WHEN the user opens the "Negocio" screen
- THEN the screen shows `B1`'s name, phone, email, address, and currency (COP)

#### Scenario: Attempt to access another business's profile

- GIVEN an authenticated session with `businessId = B1`
- WHEN a request is made for any business id other than `B1` (e.g. via a manipulated route param)
- THEN the system responds as if the resource does not exist (no data leakage) regardless of the requested id

### Requirement: Editable Business Profile

The system MUST provide `PATCH /api/business` and a business-profile edit form on the "Negocio" screen. Editable fields are `name` (required, non-empty), `phone`, `email` (valid email format), `address`, and `currency` (3-letter code). The target business is always `session.businessId` — never a client-supplied id. The request schema is `.strict()`: any unknown or non-editable field (`business_id`, `id`, audit fields, computed fields) is rejected outright with `400 VALIDATION_ERROR`, applying no change. Editing is restricted to the `editBusinessProfile` capability, which only `admin` holds — a `worker` session sees the profile in read-only form and `PATCH /api/business` responds `403 FORBIDDEN` to a session lacking the capability. The authoritative gate lives in `updateBusinessProfile` (service layer), not only in the UI.

#### Scenario: Owner edits own business profile

- GIVEN an authenticated session with `businessId = B1` and role `admin`
- WHEN the user submits the edit form with a new name and phone
- THEN `PATCH /api/business` updates `B1`'s record and the screen reflects the new values

#### Scenario: Non-admin session is denied edit access

- GIVEN an authenticated session with role `worker`
- WHEN a `PATCH /api/business` request is made, or the "Negocio" screen is opened
- THEN the API responds `403 FORBIDDEN` and the screen renders the profile read-only (no editable inputs, no Save button)

#### Scenario: Client-supplied identity/audit field is rejected

- GIVEN an authenticated session
- WHEN a `PATCH /api/business` request includes `business_id`, `id`, or an audit field (e.g. `updated_at`)
- THEN the request is rejected with `400 VALIDATION_ERROR` and no field is updated

#### Scenario: Empty payload is rejected

- GIVEN an authenticated session
- WHEN a `PATCH /api/business` request body has no fields
- THEN the request is rejected with `400 VALIDATION_ERROR`

### Requirement: business_id Scoping (RLS-Equivalent)

Business profile retrieval and update MUST be filtered by `business_id` resolved from the session in the service layer. This mock-layer filter is the functional equivalent of the future RLS policy: "`businesses` can only be read or updated when its `id` matches the profile's `business_id`."

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
