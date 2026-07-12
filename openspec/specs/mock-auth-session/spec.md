# Mock Auth Session Specification

## Purpose

Mocked authentication and session resolution for the Fase 1 scaffold, isolated behind an `AuthPort` so a real Supabase Auth adapter can replace it later without touching UI or services.

## Requirements

### Requirement: AuthPort Session Contract

The system MUST expose an `AuthPort` with `getSession(): Session | null`, where `Session = { userId, businessId, email, role }`. All UI and service code MUST depend only on this port, never on the mock adapter directly. `decodeSession` MUST require `role` as part of cookie validity; a cookie missing `role` MUST be treated as invalid.
(Previously: `Session` had no `role`; `decodeSession` only checked `userId`/`businessId`/`email`.)

#### Scenario: Valid session cookie

- GIVEN a request carries a valid opaque session cookie for the seeded demo user
- WHEN `getSession()` is called
- THEN it returns a `Session` containing the demo user's `userId`, `businessId`, `email`, and `role` (matching the membership row for that `businessId`)

#### Scenario: Missing or invalid cookie

- GIVEN a request has no cookie or an invalid/expired cookie
- WHEN `getSession()` is called
- THEN it returns `null`

#### Scenario: Legacy cookie without role is rejected

- GIVEN a pre-existing cookie encodes only `{ userId, businessId, email }` with no `role`
- WHEN `getSession()` is called
- THEN `decodeSession` treats it as invalid and returns `null`, forcing the user to re-login

### Requirement: Route Guards on Protected Surfaces

Every protected page and every private API endpoint MUST require a resolvable session before executing any business logic.

#### Scenario: Unauthenticated page access

- GIVEN no valid session
- WHEN the user requests `/dashboard` or any other protected page
- THEN the user is redirected to the login screen

#### Scenario: Unauthenticated API access

- GIVEN no valid session
- WHEN a request hits any private `/api/*` endpoint
- THEN the response is `401` with `error.code = "UNAUTHENTICATED"` per the standard error format

### Requirement: Server-Resolved business_id

`business_id` MUST always be resolved server-side from the session and MUST NOT be accepted from client payloads, query parameters, or headers.

#### Scenario: Client attempts to supply business_id

- GIVEN an authenticated session with `businessId = B1`
- WHEN a request payload or query includes a different `business_id`
- THEN the supplied value is ignored and `B1` (from session) is used for all scoping

### Requirement: Mock Login and Logout

The mock adapter MUST authenticate the single seeded demo user via email/password and issue an httpOnly, opaque session cookie; logout MUST clear it. `signIn` MUST support multiple profiles (memberships) per email/user and MUST select the default active business deterministically — the earliest membership by `created_at` ascending — embedding that membership's `role` in the issued cookie.
(Previously: `signIn` assumed exactly one profile per email and built `Session` directly from it, with no `role`.)

#### Scenario: Successful demo login

- GIVEN correct seeded demo credentials
- WHEN the user submits the login form
- THEN a session cookie is set (including `role`) and the user is redirected to the dashboard

#### Scenario: Incorrect credentials

- GIVEN incorrect credentials
- WHEN the user submits the login form
- THEN a generic error message is shown and no session cookie is set

#### Scenario: Logout clears session

- GIVEN an authenticated session
- WHEN the user logs out
- THEN the session cookie is cleared and subsequent requests are treated as unauthenticated

#### Scenario: Login with multiple memberships selects the earliest

- GIVEN the demo user has memberships in business A (created first) and business B (created second)
- WHEN the user signs in
- THEN the issued session has `businessId = A` and `role` equal to A's membership role

### Requirement: Cookie Security Attributes

The session cookie SHOULD be `HttpOnly`, `SameSite=Lax` (or stricter), and `Secure` when served over HTTPS, matching the attributes real Supabase Auth cookies will use later.

#### Scenario: Cookie attributes set on login

- GIVEN a successful login
- WHEN the response sets the session cookie
- THEN the cookie is marked `HttpOnly` and `SameSite=Lax` at minimum
