# Role-Based Navigation Specification

## Purpose

Provide a reusable capability-enforcement pattern so a role-gated page or API
route is denied to a session lacking the required capability, at both the
authoritative server layer and the navigation UX layer.

## Requirements

### Requirement: Server-Side Layer Is Authoritative

Any page or API route requiring a capability the current session's role does
not have MUST deny the request at the page/route layer, independent of
navigation UI state. A page MUST respond with a not-found result (404); an
API route MUST respond with `FORBIDDEN` (403). Nav filtering alone MUST NOT be
relied upon as the enforcement mechanism.

#### Scenario: Worker navigates directly to a gated page URL

- GIVEN a `worker` session lacking a required capability
- WHEN the worker navigates directly to the gated page's URL (bypassing the
  nav entirely)
- THEN the page responds as not-found (404), not a redirect and not a
  disclosure that the feature exists

#### Scenario: Worker calls a gated API route directly

- GIVEN a `worker` session lacking a required capability
- WHEN the worker issues a request directly to the gated API route
- THEN the response is `403 FORBIDDEN`

#### Scenario: Admin with the capability is granted access

- GIVEN an `admin` session holding the required capability
- WHEN the admin requests the gated page or API route
- THEN the request succeeds normally

### Requirement: Reusable Capability-Check Helpers

The system MUST expose one reusable helper for page enforcement and one for
API route enforcement, both built on the same underlying capability check, so
individual pages/routes do not each implement their own inline authorization
logic.

#### Scenario: Page helper denies via not-found

- GIVEN a page calls the page-enforcement helper with a capability the
  session lacks
- THEN the helper triggers a not-found response and no page content renders

#### Scenario: Route helper denies via FORBIDDEN error

- GIVEN an API route calls the route-enforcement helper with a capability the
  session lacks
- THEN the helper raises a `FORBIDDEN` error and no handler logic beyond that
  point executes

### Requirement: Navigation Items Are Filtered by Role

Navigation surfaces (sidebar and bottom nav) MUST filter out any item linking
to a capability the current session's role lacks, before rendering. A session
without a capability MUST NOT see the corresponding nav item in any
navigation surface.

#### Scenario: Worker does not see a gated nav item

- GIVEN a `worker` session lacking a required capability
- WHEN the dashboard layout renders the sidebar and bottom nav
- THEN neither surface shows the nav item for that capability

#### Scenario: Admin sees the nav item

- GIVEN an `admin` session holding the required capability
- WHEN the dashboard layout renders the sidebar and bottom nav
- THEN both surfaces show the nav item for that capability

### Requirement: Nav Filtering Is a UX Complement, Not a Security Boundary

Nav-layer filtering MUST always be paired with server-side enforcement at the
page/route layer. Hiding a nav item MUST NOT be treated as sufficient
protection on its own, since a user can navigate directly to the underlying
URL regardless of nav state.

#### Scenario: Hidden nav item does not imply the route is protected

- GIVEN a nav item is hidden for a `worker` session
- WHEN the worker requests the underlying URL directly
- THEN the server-side layer (page 404 / route 403) still denies the request,
  independent of the nav item's visibility
