import { cookies } from "next/headers";
import type { AuthPort, BusinessMembership, Role, Session } from "@/lib/services/ports";
import { createServerSupabaseClient } from "./server";

/**
 * Real Supabase Auth implementation of `AuthPort` — replaces
 * `lib/mock/auth-adapter.ts` when `isSupabaseConfigured` is true (see
 * `lib/services/repositories.ts`'s wiring).
 *
 * Supabase's own auth cookies (managed entirely by `@supabase/ssr`) carry
 * `userId`/`email`; there is no server-signed `session` cookie in this mode.
 * The ACTIVE business, however, is Supabase-agnostic app state, so it is
 * tracked in a separate httpOnly `active_business_id` cookie — set here, but
 * always VALIDATED against `BusinessRepository.listMembershipsForUser` on
 * every read (`getSession`), never trusted blindly. `role` is likewise
 * always resolved fresh from that membership lookup, never persisted in or
 * read back from a cookie — an attacker who edits `active_business_id` to
 * an arbitrary business id simply falls back to the caller's first real
 * membership, they cannot fabricate a membership/role that doesn't exist.
 *
 * `switchBusiness` is the one exception, matching
 * `lib/mock/auth-adapter.ts`'s documented contract: it performs NO
 * membership verification of its own (see the `AuthPort.switchBusiness`
 * JSDoc in `lib/services/ports.ts`) — the sole sanctioned caller,
 * `app/api/auth/switch-business/route.ts`, has already verified membership
 * via `listMembershipsForUser` before calling this.
 */

const ACTIVE_BUSINESS_COOKIE_NAME = "active_business_id";

async function setActiveBusinessCookie(businessId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BUSINESS_COOKIE_NAME, businessId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

async function deleteActiveBusinessCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_BUSINESS_COOKIE_NAME);
}

async function readActiveBusinessCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_BUSINESS_COOKIE_NAME)?.value;
}

/**
 * Lazily imported at call time (never at module top-level) to avoid a
 * circular import: `lib/services/repositories.ts` imports this adapter, so
 * a static top-level `import { repositories } from "@/lib/services/repositories"`
 * here would create a genuine cycle. `repositories.business` is already
 * backend-switched (real Postgres when configured), which is exactly what
 * we want — memberships come from Postgres in production.
 */
async function listMembershipsForUser(userId: string): Promise<BusinessMembership[]> {
  const { repositories } = await import("@/lib/services/repositories");
  return repositories.business.listMembershipsForUser(userId);
}

export const supabaseAuthAdapter: AuthPort = {
  async getSession(): Promise<Session | null> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return null;
    }

    const memberships = await listMembershipsForUser(data.user.id);
    if (memberships.length === 0) {
      return null;
    }

    const activeBusinessId = await readActiveBusinessCookie();
    const active = memberships.find((membership) => membership.businessId === activeBusinessId) ?? memberships[0]!;

    return {
      userId: data.user.id,
      businessId: active.businessId,
      email: data.user.email!,
      role: active.role,
    };
  },

  async signIn(email: string, password: string): Promise<Session | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return null;
    }

    const userId = data.user.id;
    const memberships = await listMembershipsForUser(userId);
    if (memberships.length === 0) {
      // Authenticated with Supabase but no business profile exists —
      // treat identically to "no such account", matching the mock
      // adapter's behavior when a profile lookup misses.
      return null;
    }

    // Same convention as the mock adapter: the default active business is
    // the earliest-created membership (index 0, per
    // `BusinessRepository.listMembershipsForUser`'s documented ordering).
    const active = memberships[0]!;
    await setActiveBusinessCookie(active.businessId);

    return {
      userId,
      businessId: active.businessId,
      email: data.user.email!,
      role: active.role,
    };
  },

  async signOut(): Promise<void> {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    await deleteActiveBusinessCookie();
  },

  /**
   * Pure session/cookie mechanics — performs NO membership or authorization
   * check of its own, mirroring `lib/mock/auth-adapter.ts`'s
   * `switchBusiness` contract exactly (see the full security contract in
   * the `AuthPort.switchBusiness` JSDoc, `lib/services/ports.ts`). The
   * caller (`app/api/auth/switch-business/route.ts`) is solely responsible
   * for verifying `role` against `BusinessRepository.listMembershipsForUser`
   * before calling this.
   */
  async switchBusiness(businessId: string, role: Role): Promise<Session | null> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return null;
    }

    await setActiveBusinessCookie(businessId);

    return {
      userId: data.user.id,
      businessId,
      email: data.user.email!,
      role,
    };
  },
};
