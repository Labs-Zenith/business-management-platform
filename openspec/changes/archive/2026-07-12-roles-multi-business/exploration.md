# Exploration: roles-multi-business

## Current State

**`lib/services/ports.ts`** — `Session` type:
```ts
export type Session = {
  userId: string;
  businessId: string;
  email: string;
};
```
`AuthPort`: `getSession()`, `signIn(email, password)`, `signOut()`. No `role`, no multi-business concept anywhere in the ports layer (the shared seam both mock and Postgres backends implement).

**`lib/mock/auth-adapter.ts`** — cookie name `"session"`. `encodeSession`/`decodeSession` do base64url JSON round-trip; `decodeSession`'s type guard checks exactly `userId`/`businessId`/`email` are strings — adding `role` requires updating this guard or new cookies get silently rejected. `signIn` finds ONE `profile` by scanning `store.profiles.values()` for `email === demo.email` (assumes exactly 1 profile per email) and builds `Session` directly from it. No mechanism to pick between multiple profiles for the same user, no "switch business" operation exists today.

**`migrations/1700000000000_baseline.sql`** — `profiles` table:
```sql
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES businesses(id),
  full_name TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
`user_id UNIQUE` (global) is the literal 1:1 constraint to change to `UNIQUE(user_id, business_id)` plus a new `role TEXT NOT NULL DEFAULT 'admin'` column. This is the first real migration since adopting node-pg-migrate — will be the second file in `migrations/`, same `-- Up Migration`/`-- Down Migration` convention.

**`lib/session.ts`** — `getSession()`/`requireSession()` wrap `repositories.auth`, the ONLY sanctioned way to resolve `business_id` server-side. A `role`-based authorization helper naturally layers on top of `requireSession()`'s returned `Session`.

**`middleware.ts`** — only checks *cookie presence*, doesn't decode/inspect the session — no role/business logic here today, and none needed (presence-only model stays untouched).

**`lib/mock/fixtures/data.ts`** — single business (`BUSINESS_ID`), single demo profile, no `role` field, no second business. `lib/mock/store.ts` (not yet read) also needs inspection for seeding wiring of a second business/profile.

**`components/layout/nav-items.ts`** — flat array, no role-based filtering (no gated feature exists yet — that's for the Nomina phase).

**`components/layout/dashboard-topbar.tsx`** — sync Server Component receiving `session` as a prop from `app/(dashboard)/layout.tsx` (not async, to avoid breaking `layout.test.tsx`'s client-renderer reconciliation). Natural home for a business-switcher: needs the list of the user's businesses threaded down from the layout, plus a new Client Component (sibling to `LogoutButton`) for the dropdown + POST to a switch-business endpoint.

## Affected Areas

- `migrations/` — new numbered migration: alter `profiles` (drop global unique, add `role`, add composite unique), plus a `business_features` table/column for future per-business feature flags.
- `lib/services/ports.ts` — add `role` to `Session`; add `Role` type and a way to list a user's businesses.
- `lib/mock/auth-adapter.ts` — `decodeSession` guard accepts `role`; `signIn`'s single-match lookup needs a deterministic default-business rule once one user can have N profiles; new switch-business logic (re-encode cookie for an already-authenticated user).
- `lib/db/*` — Postgres-side auth adapter equivalent (or business-repo addition) for listing memberships / switching business, matching the mock behavior.
- `lib/session.ts` — home for a `requireRole()`/capability-check wrapper.
- `lib/mock/fixtures/data.ts` + `lib/mock/store.ts` + `lib/db/seed.ts` — add second demo business + second profile (same demo user, role admin in both).
- `components/layout/dashboard-topbar.tsx` + `app/(dashboard)/layout.tsx` — business-switcher UI.
- New `lib/services/permissions.ts` — capability→role mapping helper (doesn't exist yet).

## Approaches Considered

1. **Additive membership table + session role snapshot** (recommended) — `profiles` becomes a membership table `(user_id, business_id, role)` with composite unique; `Session` carries the role for the *currently active* business, snapshotted at login/switch; switching business re-issues the cookie. Matches the goal exactly, keeps the cookie small, `middleware.ts` untouched (presence-only), reuses the existing re-encode-cookie pattern from `signIn`. Minor accepted tradeoff: role can go stale mid-session until next switch/login — acceptable since no gated feature exists yet.
2. **Session carries only `userId`, role resolved per-request from DB** — always fresh, but an extra DB round-trip per request and a larger surface change. Overkill for now.

## Recommendation

Approach 1.

## Risks

- `decodeSession`'s strict type guard will reject cookies lacking `role` once required — existing sessions need handling (force re-login is acceptable and simplest, given this is pre-launch).
- `signIn`'s single-match-by-email profile lookup breaks once one user can have N profiles — needs an explicit deterministic default-business selection (e.g., first membership by creation order).
- The `profiles.user_id UNIQUE` → `UNIQUE(user_id, business_id)` migration changes an existing constraint — first real migration on node-pg-migrate; the Down migration must correctly restore the original constraint.
- `lib/mock/store.ts` and `app/(dashboard)/layout.tsx` need explicit scoping in the proposal (both require edits, weren't in this explore's file allowlist).
- `layout.test.tsx` constrains sync vs. async Server Component boundaries for session/business data — must respect this when threading the businesses list down to the topbar.

## Ready for Proposal

Yes. Scope is well-bounded; `sdd-propose` should explicitly include `lib/mock/store.ts` and `app/(dashboard)/layout.tsx` in its file list.
