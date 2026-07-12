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
| 1 | Migration + ports + mock backend (store/fixtures/business-repo/auth-adapter) + permissions stub, fully unit-tested | PR 1 | Base = feature/tracker branch. Self-contained; mock backend is the only consumer in CI (no live Postgres). |
| 2 | Postgres `listMembershipsForUser` + seed + `switch-business` route + route test | PR 2 | Base = PR 1 branch. Depends on `ports.ts` types and mock backend from PR 1. |
| 3 | `business-switcher.tsx` + topbar/layout wiring | PR 3 | Base = PR 2 branch. Depends on the route from PR 2 and membership types from PR 1. |

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

  > **Post-review correction (pre-commit fix pass):** the signature landed as `switchBusiness(businessId, role)` with the caller supplying `role` directly — two independent reviewers flagged this as a privilege-escalation vector (a caller could pass `role: "admin"` regardless of actual membership). Fixed to `switchBusiness(businessId)`: the method now looks up the current session's own stored membership and derives `role` from it, never from the caller. `lib/services/ports.ts`, `lib/mock/auth-adapter.ts`, and `lib/mock/auth-adapter.test.ts` were all updated accordingly. Also hardened in the same pass: the session cookie is now HMAC-SHA256-signed (`lib/mock/auth-adapter.ts`) rather than plain base64url, since `role` now carries real authorization weight.

## Phase 4: Postgres Backend

- [ ] 4.1 `lib/db/business-repo.ts`: implement `listMembershipsForUser(userId)` — `SELECT b.id business_id, b.name business_name, p.role FROM profiles p JOIN businesses b ON b.id=p.business_id WHERE p.user_id=${userId} ORDER BY p.created_at ASC`.
- [ ] 4.2 `lib/db/seed.ts`: add idempotent (`ON CONFLICT (id) DO NOTHING`) inserts for the 2nd business (`BUSINESS_ID_2`) and 2nd profile (`DEMO_PROFILE_ID_2`, `role: 'admin'`).
- [ ] 4.3 Confirm no Postgres `AuthPort`/`switchBusiness` implementation is needed: `lib/services/repositories.ts` wires `auth: authAdapter` unconditionally (mock-only, both backends) — `switchBusiness` lives solely in `lib/mock/auth-adapter.ts`. Document this in a `ports.ts` or route comment to close the design's open question.

## Phase 5: Permissions Helper

- [x] 5.1 Create `lib/services/permissions.ts`: `Capability = "viewPayroll"`; `CAPABILITY_ROLES` map; `can(role, capability)` (deny-by-default for unmapped capabilities); `canViewPayroll(role)`. No runtime call site in this change.

## Phase 6: Switch-Business API Route

- [ ] 6.1 Create `app/api/auth/switch-business/route.ts` following `app/api/auth/login/route.ts`'s pattern: `z.object({businessId: z.string().min(1)}).strict()`; `requireSession()` for `userId`; `loadStoreFromCookie()`; `repositories.business.listMembershipsForUser(userId)`; if no match, `ApiError("FORBIDDEN", ...)` (403), current session untouched; else `repositories.auth.switchBusiness(businessId, match.role)`, `saveStoreToCookie(response)`, `NextResponse.json({data:{session}})` with `Cache-Control: no-store`.
- [ ] 6.2 Confirm `middleware.ts` needs NO change — `switch-business` self-guards via `requireSession()` like `login`/`logout` (both absent from `PROTECTED_PATH_PREFIXES`/matcher today); this supersedes the proposal's Affected-Areas row, per the design's explicit decision.

## Phase 7: UI Wiring

- [ ] 7.1 Create `components/layout/business-switcher.tsx` (Client Component): props `{businesses: BusinessMembership[]; activeId: string}`; dropdown of business names; on select, `POST /api/auth/switch-business {businessId}`; on success `useRouter().refresh()`; on error, show inline message and keep the previous selection.
- [ ] 7.2 `components/layout/dashboard-topbar.tsx`: accept new `businesses: BusinessMembership[]` prop (stays a sync Server Component); render `<BusinessSwitcher businesses={businesses} activeId={session.businessId} />`.
- [ ] 7.3 `app/(dashboard)/layout.tsx`: after `requireSession()`, call `repositories.business.listMembershipsForUser(session.userId)`, pass `businesses={memberships}` to `<DashboardTopbar>`.

## Phase 8: Tests

- [ ] 8.1 `lib/mock/auth-adapter.test.ts` (new): `decodeSession` rejects a role-less cookie; `signIn` picks the earliest-`createdAt` membership as default business; `switchBusiness` re-issues the cookie with the target `businessId`/`role`, never carrying over the prior role.
- [ ] 8.2 `lib/services/permissions.test.ts` (new): `canViewPayroll` deterministic per role; unmapped capability returns `false`.
- [ ] 8.3 `lib/mock/business-repo.test.ts` (new or extend): `listMembershipsForUser` returns both seeded memberships ordered by `createdAt` ASC.
- [ ] 8.4 `app/api/auth/switch-business/switch-business-route.test.ts` (new, mirrors `auth-routes.test.ts`'s cookie-jar mock): 200 + new cookie on valid membership; 403 + unchanged cookie for a non-member `businessId`; 400 on malformed payload.

## Phase 9: Verification Gate

- [ ] 9.1 `npm run typecheck`
- [ ] 9.2 `npm run lint`
- [ ] 9.3 `npm run test`
- [ ] 9.4 `npm run build`

## Phase 10: Docs / Deferred

- [ ] 10.1 ~~Confirm `.env.example` needs no changes~~ — superseded by the post-review fix pass below: `.env.example` gained `SESSION_SECRET` once the session cookie became HMAC-signed. No new DB connection env vars (still reuses `POSTGRES_URL`/mock defaults).
- [ ] 10.2 Note (no action here): `docs/business-rules.md` is updated at the end of Fase 2, once a real feature (e.g. Nomina) consumes `permissions.ts` — out of scope for this change.

## Post-Review Fix Pass (pre-commit, same PR 1 scope)

A review pass on the uncommitted PR 1 diff found and fixed 5 issues before commit (no new scope — bug fixes within already-checked tasks above):

1. **Session cookie signing (BLOCKER, security)**: `lib/mock/auth-adapter.ts`'s `encodeSession`/`decodeSession` were plain unsigned base64url — any hand-edited cookie (e.g. `role: "admin"`) would have been accepted. Added HMAC-SHA256 signing (`${payload}.${signature}`), `SESSION_SECRET` env var (fail-loud in production if unset), `crypto.timingSafeEqual` constant-time comparison. See task 3.5's note above.
2. **`switchBusiness` privilege escalation (CRITICAL)**: caller-supplied `role` param removed; the method now re-verifies membership and derives `role` from the stored profile itself. See task 3.5's note above.
3. **Stale-cookie crash (BLOCKER, resilience)**: `lib/session.ts` gained `requireSessionOrRedirect()` (redirects to `/login` via `next/navigation`) for Server Component pages/layouts, since the new `decodeSession` guard now rejects old role-less cookies and there is no `error.tsx` boundary in this tree — every `(dashboard)`/`(print)`/`/api/docs` page that previously called `requireSession()` directly was swapped to call this instead (API route handlers still use `requireSession()`, unchanged).
4. **Duplicated "profiles for user" logic**: extracted `listProfilesForUser(store, userId)` in `lib/mock/store.ts`, shared by `signIn`, `switchBusiness`, and `listMembershipsForUser`.
5. **Small hardening**: `CHECK (role IN ('admin','worker'))` added to the migration; orphaned memberships (no matching business) are now skipped in `listMembershipsForUser` instead of returning `businessName: ""`; added a cookie-persistence round-trip regression test proving the profiles-Map-keyed-by-`id` fix survives serialize/deserialize.
