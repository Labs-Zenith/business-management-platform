# Design: Roles + Multi-Business Membership Foundation

## Technical Approach

Additive membership + session-role snapshot (proposal Approach 1). `profiles` becomes a
membership table `(user_id, business_id, role)`; `Session` carries the role of the
*active* business, snapshotted at login/switch. Same demo user (same `email`, same
`DEMO_USER_ID`) now owns TWO profile rows (two businesses), both `role='admin'`.
Membership listing lives on `BusinessRepository` (swapped per backend) — NOT on
`AuthPort` (always mock) — so business names come from the active backend. Cookie
encode/decode stays fully inside the auth adapter behind a new `AuthPort` method. No
feature is gated; `permissions.ts` ships a stub with no runtime consumer yet.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Feature-flag storage | `businesses.enabled_features TEXT[]` column | join table `business_features` | Common query is "is X enabled for this business" — array avoids a join; zero current readers, no new table warranted (proposal). |
| Where "list my businesses" lives | `BusinessRepository.listMembershipsForUser(userId)` | `AuthPort` method | `auth` always stays the mock adapter (repositories.ts); memberships/names must come from the ACTIVE backend, so it belongs on the swapped `BusinessRepository`. |
| Cookie re-issue on switch | new `AuthPort.switchBusiness(businessId, role)` | export `encodeSession` and import it in the route | The route lives outside `lib/mock/**`; the ports boundary forbids importing the mock directly. A port method keeps cookie encoding encapsulated. |
| `store.profiles` Map key | re-key by profile `id` (was `userId`) | keep `userId` | One `userId` now maps to N profiles; keying by `userId` would drop the 2nd membership. |
| switch route guarding | self-guards via `requireSession()` inside the route (like login/logout) | add to `middleware.ts` matcher | Consistency: login/logout are auth-domain entry points that self-guard; switch-business is the same. `requireSession()` supplies `userId`, the trust anchor. Still add `/api/auth/switch-business` to the matcher list? NO — follow login/logout precedent. |

## Data Flow (switch)

    topbar <BusinessSwitcher> ──POST /api/auth/switch-business {businessId}
        │
        ▼
    requireSession() → userId,email
        │
        ▼
    repositories.business.listMembershipsForUser(userId)
        │  find membership where businessId matches → role  (else 403)
        ▼
    repositories.auth.switchBusiness(businessId, role) → re-encode cookie
        │
        ▼
    router.refresh()  (RSC re-render, new business_id scopes all data)

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/1700000001000_add_roles_and_membership.sql` | Create | constraint swap + `role` + `enabled_features` |
| `lib/services/ports.ts` | Modify | `Role`, `Session.role`, `BusinessMembership`, 2 iface methods |
| `lib/mock/auth-adapter.ts` | Modify | guard requires `role`; default-business signIn; `switchBusiness`; shared cookie helper |
| `lib/mock/store.ts` | Modify | `Profile.role`; re-key profiles Map by `id` (L67) |
| `lib/mock/business-repo.ts` | Modify | implement `listMembershipsForUser` |
| `lib/db/business-repo.ts` | Modify | implement `listMembershipsForUser` (SQL join) |
| `lib/mock/fixtures/data.ts` | Modify | `BUSINESS_ID_2`, 2nd business + 2nd profile fixtures, `role` on both |
| `lib/mock/fixtures/index.ts` | Modify | seed 2nd business+profile; set-by-`id` (L26,L52) |
| `lib/db/seed.ts` | Modify | idempotent INSERT of 2nd business + 2nd profile |
| `lib/services/permissions.ts` | Create | capability→role map + `canViewPayroll` stub |
| `app/api/auth/switch-business/route.ts` | Create | verify membership → re-issue cookie |
| `app/(dashboard)/layout.tsx` | Modify | call `listMembershipsForUser`, pass `businesses` prop |
| `components/layout/dashboard-topbar.tsx` | Modify | accept `businesses` prop, render switcher (stays SYNC) |
| `components/layout/business-switcher.tsx` | Create | Client Component: dropdown + POST + `router.refresh()` |

## Interfaces / Contracts

**Migration** `migrations/1700000001000_add_roles_and_membership.sql`:
```sql
-- Up Migration
ALTER TABLE profiles DROP CONSTRAINT profiles_user_id_key;
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE profiles ADD CONSTRAINT profiles_user_business_unique UNIQUE (user_id, business_id);
ALTER TABLE businesses ADD COLUMN enabled_features TEXT[] NOT NULL DEFAULT '{}';

-- Down Migration
ALTER TABLE businesses DROP COLUMN enabled_features;
ALTER TABLE profiles DROP CONSTRAINT profiles_user_business_unique;
ALTER TABLE profiles DROP COLUMN role;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
```
(`profiles_user_id_key` is Postgres's auto-name for the inline `user_id UNIQUE`. Down's
restore of global `UNIQUE(user_id)` fails only if a user has 2 memberships — acceptable,
dev-only rollback; drop the 2nd seed first.)

**`lib/services/ports.ts`**:
```ts
export type Role = "admin" | "worker";
export type Session = { userId: string; businessId: string; email: string; role: Role };
export type BusinessMembership = { businessId: string; businessName: string; role: Role };

export interface AuthPort {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session | null>;
  signOut(): Promise<void>;
  /** Re-issues the session cookie for the already-authenticated user, active business swapped. */
  switchBusiness(businessId: string, role: Role): Promise<Session | null>;
}
export interface BusinessRepository {
  getById(businessId: string): Promise<Business | null>;
  /** Memberships for a user, ordered by profile created_at ASC (index 0 = default business). */
  listMembershipsForUser(userId: string): Promise<BusinessMembership[]>;
}
```

**`auth-adapter.ts`** — guard adds `role` string check (rejects role-less cookies).
`signIn`: find one profile by `email` → `userId`; collect ALL `store.profiles` with that
`userId`, sort `createdAt` ASC, pick `[0]` as default; build `Session{...default, role}`.
`switchBusiness`: read current cookie session; if none → `null`; re-encode with new
`businessId`+`role` (keep `userId`/`email`). Extract shared `setCookie(session)` helper
(used by `signIn` and `switchBusiness`); `encodeSession` stays private.

**`app/api/auth/switch-business/route.ts`**:
```ts
// POST { businessId: string }
const { userId } = await requireSession();
const businessId = parsed.businessId; // zod: non-empty string
const memberships = await repositories.business.listMembershipsForUser(userId);
const match = memberships.find((m) => m.businessId === businessId);
if (!match) throw new ApiError("FORBIDDEN", "No membership for target business."); // 403
const session = await repositories.auth.switchBusiness(businessId, match.role);
return NextResponse.json({ businessId: session!.businessId, role: session!.role });
```

**`lib/db/business-repo.ts`** `listMembershipsForUser`:
```sql
SELECT b.id AS business_id, b.name AS business_name, p.role
FROM profiles p JOIN businesses b ON b.id = p.business_id
WHERE p.user_id = ${userId} ORDER BY p.created_at ASC
```

**`lib/services/permissions.ts`** (stub — no runtime call site in THIS change; Nomina is
the first real consumer):
```ts
import type { Role } from "./ports";
type Capability = "viewPayroll";
const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = { viewPayroll: ["admin"] };
export function can(role: Role, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}
export function canViewPayroll(role: Role): boolean { return can(role, "viewPayroll"); }
```

**Fixtures** `data.ts`: `BUSINESS_ID_2 = "10000000-0000-4000-8000-000000000002"`,
`DEMO_PROFILE_ID_2 = "30000000-0000-4000-8000-000000000002"`; `businessFixture2`
("Negocio Demo 2"); `demoProfileFixture2` = same `DEMO_USER_ID`, `businessId:
BUSINESS_ID_2`, same `email`, `role:'admin'`. Add `role:'admin'` to profile 1.

**UI**: `layout.tsx` (async RSC) resolves
`await repositories.business.listMembershipsForUser(session.userId)` and passes
`businesses={memberships}` to `<DashboardTopbar>`. Topbar stays SYNC — just forwards
`businesses` to `<BusinessSwitcher businesses={} activeId={session.businessId} />` (a new
Client Component that POSTs then calls `useRouter().refresh()`).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Static | migration idempotency/round-trip; constraint names | read `.sql`; up then down reverses exactly |
| Unit | `permissions` map; `signIn` default-business; `switchBusiness` re-issue; `decodeSession` rejects role-less | vitest |
| Unit | `listMembershipsForUser` returns 2 ordered memberships (mock) | vitest against seeded store |
| Integration | switch route: valid→200 re-cookie, non-member→403 | route handler test |
| UI | `layout.test.tsx` still renders (topbar stays sync) | existing test unmodified |

## Migration / Rollout

Single migration `up` at build (`vercel-build` chain unchanged). Both backends seed the
2nd business+profile idempotently. Role-less cookies force re-login (intended, pre-launch).

## Open Questions

- [ ] Confirm Postgres auto-constraint name is `profiles_user_id_key` on the target DB
  before relying on it in Down (else `DROP CONSTRAINT` fails). Verify at apply.
