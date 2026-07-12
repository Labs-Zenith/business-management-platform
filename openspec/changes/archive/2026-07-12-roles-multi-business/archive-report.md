# Archive Report: roles-multi-business

**Change**: roles-multi-business
**Archived**: 2026-07-12
**Status**: COMPLETE (PASS WITH WARNINGS)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Roles + Multi-Business Membership Foundation has been fully implemented, verified, and archived. All 3 chained PRs are committed to main (d84bd24, c768094, 0fb823c). The change laid the multi-tenant membership and role foundation required by 9 downstream Fase 1 features, with capability-based authorization and session-scoped business switching. Verification passed with 2 non-blocking warnings regarding test coverage nuance and checkbox bookkeeping. Ready for the next SDD change.

---

## What Shipped

### PR 1: d84bd24 — Backend/Mock Foundation
- Migration `1700000001000_add_roles_and_membership.sql`: dropped global `UNIQUE(user_id)`, added `role TEXT NOT NULL DEFAULT 'admin'`, added composite `UNIQUE(user_id, business_id)`, added `businesses.enabled_features TEXT[]`
- Types: `Role`, `BusinessMembership`, extended `Session` with `role`
- Mock backend: `store.ts` re-keyed profiles by `id`; `business-repo.ts` implemented `listMembershipsForUser()`; `auth-adapter.ts` updated to require `role` in cookies, support multi-profile login with deterministic default business
- `lib/services/permissions.ts` stub: deny-by-default `can()`/`canViewPayroll()` capability helper
- Fixtures/seed: seeded 2nd demo business (`BUSINESS_ID_2`) and 2nd profile (`DEMO_PROFILE_ID_2`), both `role='admin'`
- Post-review hardening (pre-commit): HMAC-SHA256 session cookie signing, `requireSessionOrRedirect()` for Server Components, extracted `listProfilesForUser()` shared helper
- Tests: full unit coverage of auth-adapter, permissions, and business-repo mock implementation

### PR 2: c768094 — Postgres Backend + Switch Route
- `lib/db/business-repo.ts`: implemented `listMembershipsForUser()` with SQL JOIN + ORDER BY `created_at ASC`
- `lib/db/seed.ts`: added idempotent 2nd business and 2nd profile inserts
- `app/api/auth/switch-business/route.ts`: new endpoint with membership verification, role sourcing from verified lookup, CSRF check, error logging, cache headers
- Post-review fixes (pre-commit): two major security reversions (single-arg `switchBusiness` → two-arg to avoid forged mock-store checks), added `lib/db/business-repo.test.ts`, strengthened route error handling and edge-case test coverage
- Tests: route integration tests covering valid/invalid/malformed paths, 401/403/400 responses

### PR 3: 0fb823c — UI Wiring
- `components/layout/business-switcher.tsx`: new Client Component with conditional dropdown (2+ memberships) or static text (1 membership), POST to switch-business endpoint, `router.refresh()` on success, error display on failure
- `components/layout/dashboard-topbar.tsx`: threaded `memberships` prop from layout, rendered switcher next to logout
- `app/(dashboard)/layout.tsx`: called `listMembershipsForUser()` post-session resolution, passed memberships to topbar
- Tests: business-switcher component tests (dropdown, single-membership, POST flow, error handling), updated layout test to mock membership lookup

---

## Verification Verdict

**Status**: PASS WITH WARNINGS

### Test Results
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` | PASS | tsc --noEmit clean |
| `npm run lint` | PASS | eslint clean |
| `npm run test` | PASS | 300/300 passed, 52 files |
| `npm run build` | PASS | next build Turbopack, all 22 routes, `/api/auth/switch-business` dynamic and outside matcher |

### Completeness
- Tasks: 25 of 30 checked (5 unchecked: 8.1–8.3 checkbox lag despite implementation/passing tests; 10.1–10.2 deferred docs)
- Spec compliance: 12 of 13 requirements fully COMPLIANT, 1 PARTIAL (non-blocking coverage gap)
- Security contract: HARDENED (HMAC-signed cookies, two-arg `switchBusiness` with JSDoc, route-verified membership lookups)

### Known Warnings

#### WARNING 1: Test Coverage Gap — Mixed-Role Switch Scenario
**Severity**: Non-blocking
**What**: Spec scenarios "Role changes correctly across a switch" and "Switching back restores the original role" describe a user who is `worker` in business A and `admin` in business B. The end-to-end route test cannot exercise this because both demo memberships are `role='admin'` by design (mechanism-only phase, no feature gated). Coverage is split: route test proves role sourced from verified lookup (admin→admin indistinguishable); adapter unit test proves different roles are not carried over (synthetic values, not real 2nd membership).

**Impact**: Functionally correct (code traced); no regression would catch a hypothetical future bug where old role was passed instead of `match.role` if fixtures changed.

**Mitigation**: Follow-up fixture/test addition before any role-gated feature (e.g. Nomina) consumes `permissions.ts`. Recommend adding 3rd demo profile with `role='worker'` in same business or adjusting 2nd profile's role.

#### WARNING 2: Checkbox Bookkeeping Lag
**Severity**: Cosmetic only
**What**: Tasks 8.1 (auth-adapter.test.ts), 8.2 (permissions.test.ts), 8.3 (business-repo.test.ts) remain unchecked despite implementations existing and passing all tests (confirmed in `npm run test`). Pre-existing gap from PR1/PR2 checkbox discipline not updated during PR3.

**Impact**: None — auditable artifact only. All code complete and verified.

**Mitigation**: No action required; documented as accepted known state.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Status |
|----------|----|----|
| Proposal | 30 | archived |
| Spec | 31 | archived |
| Design | 32 | archived |
| Tasks | 33 | archived |
| Verify Report | 36 | archived |

All artifacts persist in Engram for audit trail; this archive report will be saved as `sdd/roles-multi-business/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

### New Specs (Created)
- `openspec/specs/role-permissions/spec.md` — Capability-based authorization with role→permission mapping
- `openspec/specs/business-switching/spec.md` — Multi-business listing and session-scoped switching

### Modified Specs (Delta Merged)
- `openspec/specs/mock-auth-session/spec.md` — Updated AuthPort contract to include `role` in Session, legacy cookie rejection, multi-profile login with deterministic default
- `openspec/specs/business-profile/spec.md` — Added `enabled_features` column requirement and multi-member business clarification

---

## SDD Cycle Complete

✅ **Proposal** (intent, scope, approach): #30
✅ **Spec** (requirements, scenarios): #31
✅ **Design** (technical approach, file changes): #32
✅ **Tasks** (work units, phases, verification gate): #33
✅ **Apply** (3 chained PRs, full implementation): d84bd24, c768094, 0fb823c
✅ **Verify** (test execution, compliance, security): #36 (PASS WITH WARNINGS)
✅ **Archive** (specs synced, artifacts archived, this report): 2026-07-12-roles-multi-business

---

## Next Steps

1. **Immediate**: None — archive complete. Change closed.
2. **Before Nomina (role-gated feature)**: Add mixed-role fixture and end-to-end test to close WARNING-1 coverage gap (pre-approved scope, low risk).
3. **Fase 2**: 9 downstream features (egresos, nomina, inventario, audit log, feature flags) can now build on this foundation.

---

**Archive Date**: 2026-07-12
**Archived By**: sdd-archive executor
**Final Status**: READY FOR NEXT CHANGE
