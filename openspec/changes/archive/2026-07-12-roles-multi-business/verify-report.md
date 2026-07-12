## Verification Report

**Change**: roles-multi-business
**Version**: N/A (3 chained PRs, all committed to main: d84bd24, c768094, 0fb823c)
**Mode**: Standard (full artifacts: proposal, design, 4 spec files, tasks)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (checkbox items) | 30 |
| Tasks complete (checked) | 25 |
| Tasks incomplete (unchecked) | 5 (8.1, 8.2, 8.3 — test files exist and pass, checkbox bookkeeping lag explicitly documented in tasks.md; 10.1, 10.2 — deferred docs/no-action items, not core implementation) |

### Build & Tests Execution
**Typecheck**: PASS — `npm run typecheck` (tsc --noEmit) clean, zero errors.
**Lint**: PASS — `npm run lint` (eslint) clean, zero warnings/errors.
**Tests**: PASS — `npm run test` (vitest run): 300/300 passed, 52 files. Matches apply-progress's claimed final count exactly.
**Build**: PASS — `npm run build` (next build, Turbopack): compiled successfully, typecheck within build clean, all 22 routes generated, `/api/auth/switch-business` correctly dynamic (ƒ) and confirmed outside `middleware.ts`'s `PROTECTED_PATH_PREFIXES`/matcher (self-guards via `requireSession()`, same precedent as login/logout).

### Spec Compliance Matrix (traced to real code + passing tests)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Membership table (composite UNIQUE) | duplicate rejected / multi-role | migration CHECK+UNIQUE constraints; `lib/mock/business-repo.test.ts` | COMPLIANT |
| Session.role reflects active membership | role snapshot at issuance | `lib/mock/auth-adapter.test.ts` (\"accepts a well-formed cookie including role\") | COMPLIANT |
| Capability check helper (deny-by-default) | deterministic / unmapped denies | `lib/services/permissions.test.ts` (4 tests) | COMPLIANT |
| Cross-business isolation absolute | repos never trust client business_id | `requireSession(OrRedirect)` sourcing verified in `lib/session.ts`; all repo methods take businessId from session, not payload (spot-checked switch-business route + api/customers) | COMPLIANT |
| List a user's businesses (ordered by created_at ASC) | multi-membership listing | `lib/mock/business-repo.test.ts`, `lib/db/business-repo.test.ts` (3 tests: shape, ORDER BY contract, empty case) | COMPLIANT |
| Deterministic default business at login | earliest membership picked | `lib/mock/auth-adapter.test.ts` (\"signIn picks the earliest-createdAt membership\") | COMPLIANT |
| Switch endpoint verifies membership first | 403 for non-member, unchanged cookie | `switch-business-route.test.ts` (\"rejects switching to a business the user has no membership in with 403...\") | COMPLIANT |
| Re-issued session never escalates privilege | role sourced from target membership, not carried over | Split coverage: route test proves role sourced from verified `match.role` (admin→admin only, both demo memberships are role='admin' by design); `auth-adapter.test.ts` proves at the mechanics layer that a DIFFERENT role than the original session's is NOT carried over (original admin → switched \"worker\" → result is \"worker\") | PARTIAL — see Issues (WARNING) |
| Switch UI triggers refresh | success refresh / failure leaves UI unchanged | `components/layout/business-switcher.test.tsx` (dropdown, pending state, error alert, empty/mismatched-membership cases) | COMPLIANT |
| AuthPort session contract (role required, legacy cookie rejected) | valid/missing/legacy cookie | `lib/mock/auth-adapter.test.ts` (\"rejects a role-less cookie\") | COMPLIANT |
| Mock login/logout multi-profile signIn | successful/incorrect/logout/multi-membership login | `lib/mock/auth-adapter.test.ts`, `app/api/auth/*` route tests | COMPLIANT |
| business-profile delta: enabled_features column | column exists, ungated | `migrations/1700000001000_add_roles_and_membership.sql` matches spec text exactly (`TEXT[] NOT NULL DEFAULT '{}'`) | COMPLIANT |
| business-profile delta: multi-member unaffected | profile display still scoped to session.businessId | unchanged baseline behavior (no code touched this path) | COMPLIANT |

**Compliance summary**: 12/13 requirement rows fully COMPLIANT, 1 PARTIAL (documented below, non-blocking).

### Security Contract Verification (explicit focus area)
- `switchBusiness` signature is the FINAL, correct shipped state: `AuthPort.switchBusiness(businessId: string, role: Role)` in `lib/services/ports.ts`, with a prominent JSDoc security contract stating the adapter performs NO verification and the ONLY sanctioned caller is `app/api/auth/switch-business/route.ts`, which must source `role` from a prior `BusinessRepository.listMembershipsForUser` lookup.
- `lib/mock/auth-adapter.ts`'s `switchBusiness` implementation matches: pure cookie mechanics, no internal membership check, blindly trusts caller-supplied `role`.
- `app/api/auth/switch-business/route.ts` matches: calls `requireSession()`, `checkOrigin()`, `repositories.business.listMembershipsForUser(userId)`, finds `match` by `businessId`, returns 403 FORBIDDEN with unchanged cookie if no match, else calls `switchBusiness(parsed.data.businessId, match.role)` — `role` is never taken from the request body (`.strict()` schema only allows `businessId`).
- Confirmed this is the FINAL state after both documented review-fix reversions (PR1: caller-role removed then re-added with internal mock-store re-check; PR2: internal re-check reverted again because it was reading from a forgeable unsigned `app_data` cookie) — no stale intermediate version slipped through. Traced via `git log --oneline` (d84bd24, c768094, 0fb823c) and direct file inspection.
- Session cookies are HMAC-SHA256-signed (`lib/mock/auth-adapter.ts`'s `encodeSession`/`decodeSession`, `sign()` via `createHmac`, `timingSafeEqual` constant-time comparison), with `SESSION_SECRET` required in production (fail-loud) and a documented dev-only fallback. `.env.example` contains `SESSION_SECRET=`.
- Server Component pages/layouts use `requireSessionOrRedirect()` (verified: `app/(dashboard)/layout.tsx`, `app/(dashboard)/settings/page.tsx`, `app/(dashboard)/customers/page.tsx`, `app/(print)/invoices/[id]/receipt/page.tsx`, and 7 others — 11 files total). API route handlers correctly use raw `requireSession()` (throws `ApiError` 401, caught by the route wrapper) — verified across all `app/api/**/route.ts` files including the new switch-business route. No page incorrectly uses the crash-prone `requireSession()`.
- `middleware.ts`: `switch-business` correctly absent from `PROTECTED_PATH_PREFIXES`/matcher, self-guards via `requireSession()` inside the route — matches login/logout precedent, matches design.md's explicit decision.

### business-profile delta vs migration cross-check
`openspec/changes/roles-multi-business/specs/business-profile/spec.md`'s ADDED requirement ("`enabled_features` column, array of feature-key strings, default empty, no reader yet") matches `migrations/1700000001000_add_roles_and_membership.sql` line 21 exactly: `ALTER TABLE businesses ADD COLUMN enabled_features TEXT[] NOT NULL DEFAULT '{}'`. Consistent.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| Migration up/down | Implemented | Down restores `profiles_user_id_key UNIQUE(user_id)` in reverse order; documented dev-only caveat if 2+ memberships exist |
| ports.ts types | Implemented | `Role`, `Session.role`, `BusinessMembership`, `AuthPort.switchBusiness`, `BusinessRepository.listMembershipsForUser` all present and correctly typed |
| Mock backend (store/fixtures/business-repo/auth-adapter) | Implemented | Profiles Map re-keyed by `id`; `listProfilesForUser` shared helper; 2nd business/profile fixtures added |
| Postgres backend (business-repo/seed) | Implemented | SQL join + ORDER BY matches design; seed idempotent via `ON CONFLICT (id) DO NOTHING` |
| permissions.ts | Implemented | Stub with deny-by-default `can()`/`canViewPayroll()`, no runtime consumer yet (in scope) |
| switch-business route | Implemented | Full validation, auth, CSRF check, logging, cache headers |
| UI wiring (business-switcher/topbar/layout) | Implemented | Dropdown only shown for 2+ memberships, pending/error states, re-entrancy guard |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| Additive membership + session-role snapshot | Yes | |
| `enabled_features` as TEXT[] not join table | Yes | |
| `listMembershipsForUser` on `BusinessRepository`, not `AuthPort` | Yes | |
| `switchBusiness` encapsulated behind port, mock-only impl documented via JSDoc | Yes | Superseded/hardened twice via review passes, final state matches design intent (route is sole gate) plus the necessary security hardening the original design didn't anticipate (HMAC signing) |
| Both demo memberships seeded as role='admin' | Yes (explicit design choice) | Creates the one coverage gap noted below |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. Spec scenarios "Role changes correctly across a switch" and "Switching back restores the original role" (business-switching/spec.md) describe a user who is `worker` in business A and `admin` in business B. No integration/route-level test exercises this exact combination end-to-end, because both seeded demo memberships are `role: 'admin'` (an explicit, documented design choice in design.md). Coverage is split: the route test only proves admin→admin switching against real verified membership data (can't distinguish "correctly sourced" from "accidentally identical"); `lib/mock/auth-adapter.test.ts` proves at the pure-mechanics layer that a genuinely different role is not carried over from the prior session, using an arbitrary/synthetic role value rather than a real second membership. Functionally the shipped code is correct (traced directly), but there is no single test that would catch a regression where the route accidentally passed the OLD role instead of `match.role` if both memberships happened to share a role in a future fixture change. Non-blocking given proposal's explicit "mechanism only, no feature gated" scope, but worth a follow-up fixture/test addition before any role-gated feature (e.g. Nomina) ships.
2. Tasks 8.1/8.2/8.3 in `tasks.md` remain unchecked despite `lib/mock/auth-adapter.test.ts`, `lib/services/permissions.test.ts`, and `lib/mock/business-repo.test.ts` all existing and passing (confirmed directly) — this is explicitly self-documented in tasks.md's own Phase 8 note as a "pre-existing checkbox bookkeeping gap from PR1/PR2," not a real implementation gap. Cosmetic only.

**SUGGESTION**:
1. Tasks 10.1/10.2 (docs/env deferred items) remain unchecked — correctly so, they are explicitly "no action here" / superseded notes, not blocking.
2. Consider adding a worker/admin mixed-role fixture (3rd demo profile or adjusted 2nd profile) in a follow-up change once a real role-gated feature consumes `permissions.ts`, to close the WARNING-1 coverage gap with a genuine end-to-end regression test.

### Verdict
**PASS WITH WARNINGS**
All 4 verification commands (typecheck, lint, test, build) are green on current main. Every spec requirement across all 4 domain files traces to real, shipped code. The security-critical `switchBusiness` contract is exactly the final hardened shape described (two-arg, route-verified, adapter-trusts-caller, HMAC-signed cookies) with no stale intermediate version present. The only gaps are a non-blocking test-coverage nuance (split/indirect coverage of the worker/admin role-switch scenario, by explicit design since both demo businesses share role='admin') and cosmetic checkbox bookkeeping lag in tasks.md — both explicitly self-documented in the tasks artifact already. Safe to archive; recommend logging the coverage-gap follow-up as known accepted work before any role-gated feature (Nomina) builds on top of `permissions.ts`.
