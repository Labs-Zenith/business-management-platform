# Proposal: Roles + Multi-Business Membership Foundation

## Intent

Today `profiles.user_id` is globally UNIQUE (1 user = 1 business) and `Session` has no role. This blocks Fase 1's 9 downstream features (egresos, nomina, inventario, audit log, feature flags). This change lays the multi-tenant membership + role foundation those features depend on. No feature is gated here — only the mechanism.

## Scope

### In Scope
- Migration #2: `profiles` drops global `UNIQUE(user_id)`, adds `role TEXT NOT NULL DEFAULT 'admin'` (`admin|worker`), adds `UNIQUE(user_id, business_id)`.
- Per-business feature-flag mechanism (unused): `businesses.enabled_features TEXT[]`.
- `Session` gains `role`; `Role` type in `ports.ts`; port method to list a user's businesses.
- `lib/services/permissions.ts` — capability→role helper (e.g. stub `canViewPayroll(role)`).
- Switch-business API route + verify-membership + cookie re-issue; topbar dropdown → POST → `router.refresh()`.
- Deterministic default-business-at-login rule; second demo business seeded in mock + Postgres.

### Out of Scope
- Any actual gated feature (Nomina/Inventario) — mechanism only.
- Inviting/creating workers or users; real auth/passwords (single demo credential stays).
- Per-request DB role lookup; `is_default` flag; `middleware.ts` decode logic.

## Capabilities

### New Capabilities
- `role-permissions`: capability→role mapping and role-scoped session semantics.
- `business-switching`: list memberships + switch active business, re-issuing session.

### Modified Capabilities
- `mock-auth-session`: `Session` carries `role`; `signIn` selects a default business among N profiles; `decodeSession` rejects role-less cookies.
- `business-profile`: `profiles` becomes a membership table (composite unique); `enabled_features` column.

## Approach

Additive membership + session role snapshot (exploration Approach 1). Role is captured in the cookie at login/switch, re-issued on switch; accept minor staleness (no gated feature yet). Default business = first membership by `created_at` ascending. `businesses.enabled_features TEXT[]` chosen over a join table: common query is "is X enabled for this business" — an array avoids a join and needs no new table for a mechanism with zero current readers.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/*_roles_multi_business.sql` | New | constraint swap, `role`, `enabled_features` |
| `lib/services/ports.ts` | Modified | `role`, `Role`, list-businesses |
| `lib/mock/auth-adapter.ts` | Modified | guard, default-business, switch |
| `lib/services/permissions.ts` | New | capability helper |
| `lib/db/seed.ts`, `lib/mock/{fixtures/data,store}.ts` | Modified | 2nd business+profile |
| `app/api/auth/switch-business/route.ts` | New | verify + re-issue cookie |
| `components/layout/dashboard-topbar.tsx`, `app/(dashboard)/layout.tsx` | Modified | switcher UI |
| `middleware.ts` | Modified | add switch route to protected matcher |

## Multi-Tenant / business_id Impact

This change is entirely about tenant boundaries.
- Every repository method still resolves `business_id` from the session — never from client payloads.
- The active `businessId` in the cookie is the sole scoping key; switching re-issues it only after verifying the `userId` has a membership for the target business.
- `UNIQUE(user_id, business_id)` is DB-level enforcement that a user cannot hold two conflicting memberships for one business.
- Cross-business access remains impossible: a session scoped to business A can never read/write business B data; switch requires an existing membership row.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Role goes stale mid-session | Med | Acceptable — no gated feature; refreshed on switch/login |
| Down migration mis-restores old constraint | Med | Test up/down round-trip; restore global `UNIQUE(user_id)` |
| Old role-less cookies rejected | High | Intended — forces re-login, fine pre-launch |
| Switch to non-member business | Low | Route verifies membership before re-issue |

## Rollback Plan

Run migration Down (restores global `UNIQUE(user_id)`, drops `role`/`enabled_features`); revert `Session`/adapter/seed/UI commits. Cookie shape reverts, so lingering new-shape cookies fail the old guard → re-login. No destructive data loss (additive columns, restorable constraint).

## Success Criteria
- [ ] Demo user has 2 memberships; topbar switcher changes active business and scoped data.
- [ ] `Session.role` populated from active membership; role-less cookies rejected.
- [ ] Migration up/down round-trips cleanly on both backends' parity.
- [ ] `permissions.ts` compiles with a documented capability example; no feature actually gated.
