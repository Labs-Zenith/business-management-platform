# Business Switching Specification

## Purpose

Lets a user with memberships in multiple businesses list them and switch the session's active business, re-issuing the session cookie with the target business's role. Defines the deterministic default-business rule applied at login.

## Requirements

### Requirement: List a User's Businesses

The system MUST expose a port method returning all businesses the session's `userId` holds a membership in, ordered by membership `created_at` ascending.

#### Scenario: Multiple memberships listed in creation order

- GIVEN a user has memberships in business A (created first) and business B (created second)
- WHEN the user's businesses are listed
- THEN the result contains both, ordered A before B

### Requirement: Deterministic Default Business at Login

At login, the system MUST select the default active business as the user's earliest membership by `created_at` ascending. This rule MUST be deterministic — the same memberships always yield the same default.

#### Scenario: Sign-in selects earliest membership

- GIVEN the demo user has memberships in business A (created first) and business B (created second)
- WHEN the user signs in
- THEN the issued session has `businessId = A` and `role` equal to A's membership role

#### Scenario: Single membership unaffected

- GIVEN a user has exactly one membership
- WHEN the user signs in
- THEN that membership's business and role are used, identical to pre-existing single-business behavior

### Requirement: Switch Endpoint Verifies Membership Before Acting

The switch-business endpoint MUST verify the session's `userId` has a membership row for the requested target `business_id` before issuing any new session. Requests targeting a business with no membership MUST be rejected without altering the current session.

#### Scenario: Switch to a business the user belongs to

- GIVEN an authenticated session and a target `business_id` the user holds a membership in
- WHEN the user requests to switch to that business
- THEN the request succeeds and a new session is issued scoped to the target business

#### Scenario: Switch to a business the user does not belong to

- GIVEN an authenticated session and a target `business_id` the user has no membership row for
- WHEN the user requests to switch to that business
- THEN the request is rejected (403/not-found equivalent), no new cookie is issued, and the current session remains unchanged

### Requirement: Re-Issued Session Never Escalates Privilege

On a successful switch, the new session's `businessId` MUST equal the target and its `role` MUST equal exactly the role of the membership row for `(userId, target business_id)` — never the role carried over from the previous session.

#### Scenario: Role changes correctly across a switch

- GIVEN a user is `worker` in business A and `admin` in business B
- WHEN the user switches from A to B
- THEN the new session has `role = admin`, sourced from B's membership row, not `worker` carried over from A

#### Scenario: Switching back restores the original role

- GIVEN the user switched from A (`worker`) to B (`admin`)
- WHEN the user switches back to A
- THEN the new session has `role = worker`, matching A's membership row

### Requirement: Switch UI Triggers Session Refresh

The dashboard topbar SHOULD present the user's businesses in a dropdown; selecting one SHOULD POST to the switch-business endpoint and, on success, SHOULD trigger a refresh (e.g. `router.refresh()`) so all scoped data reflects the new active business.

#### Scenario: Successful switch updates visible data

- GIVEN the user selects a different business from the topbar dropdown
- WHEN the switch request succeeds
- THEN the UI refreshes and subsequently displays data scoped to the newly active business

#### Scenario: Failed switch leaves UI unchanged

- GIVEN the switch request is rejected (e.g. no membership for target)
- WHEN the response returns an error
- THEN the UI surfaces the error and the active business shown remains the previous one
