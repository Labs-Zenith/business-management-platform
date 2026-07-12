# Tasks: Roles + Multi-Business Membership Foundation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-800 (migration ~20, ports ~15, auth-adapter rewrite ~70, store/fixtures ~55, mock+db business-repo ~35, seed ~10, permissions.ts ~20 new, switch-business route ~55 new, UI (switcher+topbar+layout) ~70, tests ~230) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend/mock foundation) → PR 2 (Postgres + API route) → PR 3 (UI wiring) |
| Delivery strategy | ask-on-risk (default; not overridden in this session) |
| Chain strategy | feature-branch-chain (recommended; ask user to confirm before apply) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migration + ports + mock backend (store/fixtures/business-repo/auth-adapter) + permissions stub, fully unit-tested | PR 1 | Base = feature/tracker branch. Self-contained; mock backend is the only consumer in CI (no live Postgres). COMPLETE (commit d84bd24 on main). |
| 2 | Postgres `listMembershipsForUser` + seed + `switch-business` route + route test | PR 2 | Base = PR 1 branch. Depends on `ports.ts` types and mock backend from PR 1. COMPLETE (implementation + 2 fix passes, uncommitted). |
| 3 | `business-switcher.tsx` + topbar/layout wiring | PR 3 | Base = PR 2 branch. Depends on the route from PR 2 and membership types from PR 1. NOT STARTED. |

## Phase 1: Database Migration (Foundation)

- [x] 1.1 Create `migrations/1700000001000_add_roles_and_membership.sql`. Up: `DROP CONSTRAINT profiles_user_id_key`; add `role TEXT NOT NULL DEFAULT 'admin'`; add `UNIQUE(user_id, business_id)` as `profiles_user_business_unique`; add `businesses.enabled_features TEXT[] NOT NULL DEFAULT '{}'`. Down: exact reverse order, restoring `profiles_user_id_key UNIQUE(user_id)`.
- [x] 1.2 Verify `profiles_user_id_key` is Postgres's real auto-name for baseline's inline `user_id UUID NOT NULL UNIQUE` (design's open question) — confirm on a scratch DB or document the assumption inline as a migration comment.

## Phase 2: Ports & Types (Foundation)

- [x] 2.1 `lib/services/ports.ts`: add `export type Role = "admin" | "worker"`; add `role: Role` to `Session`; add `export type BusinessMembership = { businessId; businessName; role }`; add `switchBusiness(businessId, role): Promise<Session | null>` to `AuthPort`; add `listMembershipsForUser(userId): Promise<BusinessMembership[]>` to `BusinessRepository`.

## Phase 3: Mock Backend

- [x] 3.1 `lib/mock/store.ts`: add `role: Role` to `Profile`; re-key `profiles` Map by profile `id` (not `userId`) — update `hydrateStore` (L67, currently `p.userId`) and doc comment (L20).
- [x] 3.2 `lib/mock/fixtures/data.ts`: add `role: 'admin'` to `demoProfileFixture`; add `BUSINESS_ID_2`, `DEMO_PROFILE_ID_2`, `businessFixture2` ("Negocio Demo 2"), `demoProfileFixture2` (same `DEMO_USER_ID`, `businessId: BUSINESS_ID_2`, `role: 'admin'`).
- [x] 3.3 `lib/mock/fixtures/index.ts`: `seedFixtures` sets both businesses/profiles keyed by `id`; `seedMinimal` also seeds both profiles (needed so the cookie-persistence path can demo the switcher).
- [x] 3.4 `lib/mock/business-repo.ts`: implement `listMembershipsForUser(userId)` — filter `store.profiles` by `userId`, sort `createdAt` ASC, map to `{businessId, businessName, role}` joined against `store.businesses`.
- [x] 3.5 `lib/mock/auth-adapter.ts`: `decodeSession` guard requires `role: string`; `signIn` collects all profiles for the resolved `userId`, sorts `createdAt` ASC, picks `[0]` as default; extract shared `setCookie(session)` helper (used by `signIn` and new `switchBusiness`); implement `switchBusiness(businessId)` — reads current session via existing cookie, returns `null` if none, else re-verifies the current `userId` has a membership for `businessId` (else returns `null`, current session untouched) and re-encodes keeping `userId`/`email`, swapping `businessId`/`role` to that membership's OWN stored values.

  > **Post-review correction (pre-commit fix pass, PR 1):** the signature landed as `switchBusiness(businessId, role)` with the caller supplying `role` directly — two independent reviewers flagged this as a privilege-escalation vector (a caller could pass `role: "admin"` regardless of actual membership). Fixed to `switchBusiness(businessId)`: the method now looks up the current session's own stored membership and derives `role` from it, never from the caller. `lib/services/ports.ts`, `lib/mock/auth-adapter.ts`, and `lib/mock/auth-adapter.test.ts` were all updated accordingly. Also hardened in the same pass: the session cookie is now HMAC-SHA256-signed (`lib/mock/auth-adapter.ts`) rather than plain base64url, since `role` now carries real authorization weight.
  >
  > **Second post-review correction (pre-commit fix pass, PR 2):** the PR 1 fix above traded one privilege-escalation vector for another — the single-arg `switchBusiness(businessId)`'s internal membership re-check read `lib/mock/store.ts` (via `listProfilesForUser`), which is hydrated every request from the UNSIGNED `app_data` cookie (`lib/mock/cookie-persistence.ts`). An attacker could hand-edit that cookie to forge a membership row and pass the route's separate, correct, backend-aware `repositories.business.listMembershipsForUser` check, then have the mock-store check "confirm" the forged row. Reverted to `switchBusiness(businessId, role)`: the adapter is now PURE session/cookie mechanics with NO internal verification, and the route (`app/api/auth/switch-business/route.ts`) is the SOLE authorization gate, passing `role` from its own already-verified, backend-aware lookup. `lib/services/ports.ts` (JSDoc security contract), `lib/mock/auth-adapter.ts`, and `lib/mock/auth-adapter.test.ts` updated accordingly.

## Phase 4: Postgres Backend

- [x] 4.1 `lib/db/business-repo.ts`: implement `listMembershipsForUser(userId)` — `SELECT b.id business_id, b.name business_name, p.role FROM profiles p JOIN businesses b ON b.id=p.business_id WHERE p.user_id=${userId} ORDER BY p.created_at ASC`.
- [x] 4.2 `lib/db/seed.ts`: add idempotent (`ON CONFLICT (id) DO NOTHING`) inserts for the 2nd business (`BUSINESS_ID_2`) and 2nd profile (`DEMO_PROFILE_ID_2`, `role: 'admin'`).
- [x] 4.3 Confirm no Postgres `AuthPort`/`switchBusiness` implementation is needed: `lib/services/repositories.ts` wires `auth: authAdapter` unconditionally (mock-only, both backends) — `switchBusiness` lives solely in `lib/mock/auth-adapter.ts`. Document this in a `ports.ts` or route comment to close the design's open question.
  - Added `lib/db/business-repo.test.ts` (pre-commit fix pass, PR 2 scope — see below) covering `listMembershipsForUser`'s row-mapping, `ORDER BY` contract, and empty-result case; previously untested.

## Phase 5: Permissions Helper

- [x] 5.1 Create `lib/services/permissions.ts`: `Capability = "viewPayroll"`; `CAPABILITY_ROLES` map; `can(role, capability)` (deny-by-default for unmapped capabilities); `canViewPayroll(role)`. No runtime call site in this change.

## Phase 6: Switch-Business API Route

- [x] 6.1 Create `app/api/auth/switch-business/route.ts` following `app/api/auth/login/route.ts`'s pattern: `z.object({businessId: z.string().min(1)}).strict()`; `requireSession()` for `userId`; `loadStoreFromCookie()`; `repositories.business.listMembershipsForUser(userId)`; if no match, `ApiError("FORBIDDEN", ...)` (403), current session untouched; else `repositories.auth.switchBusiness(businessId, match.role)` (two-arg, per the second post-review fix on task 3.5 above — `role` comes from THIS route's own already-verified, backend-aware lookup, never re-derived or re-checked internally, and never from the request body), `saveStoreToCookie(response)`, `NextResponse.json({data:{session}})` with `Cache-Control: no-store`. Also calls `checkOrigin(request)` (pre-commit fix pass, PR 2 scope) and logs unexpected errors via `console.error("[switch-business] unexpected error", error)`.
- [x] 6.2 Confirm `middleware.ts` needs NO change — `switch-business` self-guards via `requireSession()` like `login`/`logout` (both absent from `PROTECTED_PATH_PREFIXES`/matcher today); this supersedes the proposal's Affected-Areas row, per the design's explicit decision.

## Phase 7: UI Wiring

- [x] 7.1 Create `components/layout/business-switcher.tsx` (Client Component): props `{businesses: BusinessMembership[]; activeId: string}`; dropdown of business names; on select, `POST /api/auth/switch-business {businessId}`; on success `useRouter().refresh()`; on error, show inline message and keep the previous selection.
  > **Implementation note (PR3):** shipped as `<BusinessSwitcher currentBusinessId memberships />` (renamed from `{activeId, businesses}` for clarity — same shapes/semantics). Only renders a dropdown when `memberships.length > 1`; with exactly 1 membership it renders the business name as static text (no switcher). On success calls `router.refresh()` only — no `router.push("/dashboard")` — per `design.md`'s "Data Flow (switch)" contract, so the user isn't yanked off whatever `(dashboard)` page they were viewing. Uses this project's already-installed `@base-ui/react`-backed `components/ui/dropdown-menu.tsx` (no prior in-app consumer existed to mirror; chosen over `Select` since this is an actions list, not a form control).
- [x] 7.2 `components/layout/dashboard-topbar.tsx`: accept new `businesses: BusinessMembership[]` prop (stays a sync Server Component); render `<BusinessSwitcher businesses={businesses} activeId={session.businessId} />`.
  > **Implementation note (PR3):** prop renamed to `memberships` (matching 7.1); rendered as `<BusinessSwitcher currentBusinessId={session.businessId} memberships={memberships} />` next to the avatar/logout group. Component remains a synchronous Server Component — no fetching added.
- [x] 7.3 `app/(dashboard)/layout.tsx`: after `requireSession()`, call `repositories.business.listMembershipsForUser(session.userId)`, pass `businesses={memberships}` to `<DashboardTopbar>`.
  > **Implementation note (PR3):** this layout already calls `requireSessionOrRedirect()` (PR1 post-review fix, not `requireSession()`); `listMembershipsForUser(session.userId)` is called right after, and the result is passed to `<DashboardTopbar>` as `memberships={memberships}`.

## Phase 8: Tests

- [ ] 8.1 `lib/mock/auth-adapter.test.ts` (new): `decodeSession` rejects a role-less cookie; `signIn` picks the earliest-`createdAt` membership as default business; `switchBusiness` re-issues the cookie with the target `businessId`/`role`, never carrying over the prior role.
- [ ] 8.2 `lib/services/permissions.test.ts` (new): `canViewPayroll` deterministic per role; unmapped capability returns `false`.
- [ ] 8.3 `lib/mock/business-repo.test.ts` (new or extend): `listMembershipsForUser` returns both seeded memberships ordered by `createdAt` ASC.
- [x] 8.4 `app/api/auth/switch-business/switch-business-route.test.ts` (new, mirrors `auth-routes.test.ts`'s cookie-jar mock): 200 + new cookie on valid membership; 403 + unchanged cookie for a non-member `businessId`; 400 on malformed payload. Also covers 401 for an unauthenticated request and the `Cache-Control: no-store` header.
  - Pre-commit fix pass (PR 2 scope) added: missing `businessId` field, empty-string `businessId`, wrong-type (`number`) `businessId`, malformed/invalid JSON body, `Cache-Control: no-store` on error responses (401/403/400, not just 200), and strengthened the success-case assertion to a full `toEqual` on the session shape (`userId`/`email` preserved, `businessId`/`role` updated).
- [x] 8.5 (new, PR 3 scope — not originally numbered) `components/layout/business-switcher.test.tsx`: static text (no dropdown) with 1 membership; dropdown lists other businesses with 2+; selecting a business POSTs and calls `router.refresh()` on success; shows an inline error (role="alert") without crashing on a 403 or network failure. Also updated `app/(dashboard)/layout.test.tsx` to mock `repositories.business.listMembershipsForUser` and assert it's called.
  - Note: 8.1–8.3 above are also unchecked in this file despite their corresponding implementation tasks (3.5, 4.1/4.3, 5.1) being marked done and their test files (`lib/mock/auth-adapter.test.ts`, `lib/mock/business-repo.test.ts`, `lib/services/permissions.test.ts`) already existing and passing (confirmed in this PR's full `npm run test` run) — pre-existing checkbox bookkeeping gap from PR1/PR2, left as-is since fixing it is outside this PR3 (Phase 7 UI wiring) scope.

## Phase 9: Verification Gate

- [x] 9.1 `npm run typecheck`
- [x] 9.2 `npm run lint`
- [x] 9.3 `npm run test`
- [x] 9.4 `npm run build`

## Phase 10: Docs / Deferred

- [ ] 10.1 ~~Confirm `.env.example` needs no changes~~ — superseded by the post-review fix pass below: `.env.example` gained `SESSION_SECRET` once the session cookie became HMAC-signed. No new DB connection env vars (still reuses `POSTGRES_URL`/mock defaults).
- [ ] 10.2 Note (no action here): `docs/business-rules.md` is updated at the end of Fase 2, once a real feature (e.g. Nomina) consumes `permissions.ts` — out of scope for this change.

## Post-Review Fix Pass (pre-commit, PR 1 scope)

A review pass on the uncommitted PR 1 diff found and fixed 5 issues before commit (no new scope — bug fixes within already-checked tasks above):

1. **Session cookie signing (BLOCKER, security)**: `lib/mock/auth-adapter.ts`'s `encodeSession`/`decodeSession` were plain unsigned base64url — any hand-edited cookie (e.g. `role: "admin"`) would have been accepted. Added HMAC-SHA256 signing (`${payload}.${signature}`), `SESSION_SECRET` env var (fail-loud in production if unset), `crypto.timingSafeEqual` constant-time comparison. See task 3.5's note above.
2. **`switchBusiness` privilege escalation (CRITICAL)**: caller-supplied `role` param removed; the method now re-verifies membership and derives `role` from the stored profile itself. See task 3.5's note above.
3. **Stale-cookie crash (BLOCKER, resilience)**: `lib/session.ts` gained `requireSessionOrRedirect()` (redirects to `/login` via `next/navigation`) for Server Component pages/layouts, since the new `decodeSession` guard now rejects old role-less cookies and there is no `error.tsx` boundary in this tree — every `(dashboard)`/`(print)`/`/api/docs` page that previously called `requireSession()` directly was swapped to call this instead (API route handlers still use `requireSession()`, unchanged).
4. **Duplicated "profiles for user" logic**: extracted `listProfilesForUser(store, userId)` in `lib/mock/store.ts`, shared by `signIn`, `switchBusiness`, and `listMembershipsForUser`.
5. **Small hardening**: `CHECK (role IN ('admin','worker'))` added to the migration; orphaned memberships (no matching business) are now skipped in `listMembershipsForUser` instead of returning `businessName: ""`; added a cookie-persistence round-trip regression test proving the profiles-Map-keyed-by-`id` fix survives serialize/deserialize.

## Post-Review Fix Pass (pre-commit, PR 2 scope)

A 4-lens review on the uncommitted PR 2 diff (Postgres backend + switch-business route) found and fixed 7 issues before commit — no new scope, bug/gap fixes within already-checked tasks 3.5/4.1/4.3/6.1/8.4 above:

1. **`switchBusiness` trusts a forgeable data source (BLOCKER, privilege escalation)**: the route did TWO independent membership checks from TWO different sources — the correct, backend-aware `repositories.business.listMembershipsForUser` AND `switchBusiness`'s own internal re-check against `lib/mock/store.ts`, which is hydrated every request from the UNSIGNED `app_data` cookie. An attacker who is a genuine member of a real business could hand-edit that cookie to forge an `admin` row for that same business and have the mock-store check "confirm" it. Fixed by reverting `AuthPort.switchBusiness` back to `(businessId, role)` with a prominent security-contract JSDoc, stripping the mock adapter down to pure cookie mechanics with no internal verification, and making the route's existing backend-aware check the sole authorization gate (passes `match.role` explicitly). See task 3.5's second post-review note above.
2. **Zero test coverage for the new Postgres `listMembershipsForUser` SQL (CRITICAL)**: no `lib/db/*.test.ts` existed anywhere. Added `lib/db/business-repo.test.ts`, mocking `lib/db/client.ts`'s `sql` tagged-template function, covering the mapped shape, the `ORDER BY p.created_at ASC` contract, and the empty-result case.
3. **Switch-business route swallowed errors with zero observability (CRITICAL)**: added `console.error("[switch-business] unexpected error", error)` in the outer catch, matching `lib/server/http.ts`'s `withApiHandler` convention of logging non-`ApiError` failures (the closest established convention in this codebase, since `login`/`logout` — which this route otherwise mirrors — have no such handler and are out of scope here).
4. **Missing edge-case tests on the switch-business route (WARNING)**: added tests for a missing `businessId` field, empty-string `businessId`, wrong-type (`number`) `businessId`, malformed/invalid JSON body, and `Cache-Control: no-store` on error responses (401/403/400) in addition to the 200 path. Strengthened the success-case assertion from a 2-field `toMatchObject` to a full-session `toEqual` (`userId`/`email` preserved, `businessId`/`role` updated).
5. **Misleading/duplicated JSDoc (readability)**: `ports.ts`'s `switchBusiness` JSDoc no longer claims backend-agnostic behavior via a "`BusinessRepository`-sourced membership row" (never true of the old mock implementation, and superseded by fix 1's rewrite anyway); it now cross-references `lib/services/repositories.ts`'s wiring comment instead of re-explaining the same fact with independently-drifting wording.
6. **SQL comment clarity (cheap)**: `lib/db/business-repo.ts`'s comment above `listMembershipsForUser` now states that an orphaned membership is structurally UNREACHABLE in Postgres (not just "naturally excluded") because `profiles.business_id` is `NOT NULL REFERENCES businesses(id)` with default `RESTRICT` (confirmed against `migrations/1700000000000_baseline.sql` — no `ON DELETE CASCADE`/`SET NULL`), unlike the mock's plain `Map`, which has no referential integrity and where an orphaned entry is a real, reachable state.
7. **CSRF convention gap (cheap)**: added `checkOrigin(request)` (`lib/server/origin-check.ts`) to the switch-business route, matching the convention already used by mutating routes like `app/api/customers/route.ts`'s `POST` handler — `login`/`logout` intentionally left untouched (pre-existing, documented gap, out of scope here).

Verification re-run after this fix pass: `npm run typecheck` (clean), `npm run lint` (clean), `npm run test` (291/291 passed, 51 files — up from 284/50), `npm run build` (green; `/api/auth/switch-business` still dynamic and outside the middleware matcher).
