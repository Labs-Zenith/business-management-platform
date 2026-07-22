import { cookies } from "next/headers";
import { openJson, sealJson } from "@/lib/server/cookie-crypto";
import type { AuthPort, BusinessMembership, Role, SavedAccount, Session } from "@/lib/services/ports";
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
 *
 * ---------------------------------------------------------------------
 * Wave 3 — Multi-account instant switching (Instagram-style)
 * ---------------------------------------------------------------------
 * Supabase (`@supabase/ssr`) keeps exactly ONE active session cookie family
 * (`sb-<ref>-auth-token*`) at a time. To hold several DIFFERENT accounts
 * (different logins — distinct from `switchBusiness`'s same-user
 * multi-business switching), each account's own REFRESH TOKEN is stashed in
 * a separate, app-owned httpOnly `saved_accounts` cookie: a JSON array of
 * `{userId, email, label, refreshToken}` (never exposed outside this file —
 * see `SavedAccount`, the public/non-secret projection returned by
 * `listSavedAccounts`).
 *
 * The tricky invariant is refresh-token ROTATION: Supabase rotates a
 * refresh token every time it's actually used (e.g. `refreshSession`, or
 * `middleware.ts`'s `updateSession` refreshing the ACTIVE account's token
 * over time). So:
 *   1. `signIn` captures the PREVIOUSLY-active account's live refresh token
 *      (if any, and if it's a different user) BEFORE calling
 *      `signInWithPassword` — which immediately overwrites the `sb-*`
 *      cookie family — so "add another account" never silently drops the
 *      account being left behind. It then appends/updates the newly signed
 *      in account's own entry with ITS fresh refresh token.
 *   2. `switchAccount(userId)`: FIRST captures the CURRENTLY-active
 *      account's live refresh token (so the account being left keeps a
 *      fresh, valid token in `saved_accounts` — its own token doesn't
 *      rotate again until it's used); THEN exchanges the target's stored
 *      refresh token via `refreshSession` (which writes the new `sb-*`
 *      cookie family via the server client's `setAll`); THEN re-saves the
 *      target's entry with its NEW rotated refresh token; THEN resets
 *      `active_business_id` to the target's first membership. A
 *      stale/invalid stored token (refresh error) drops that account from
 *      `saved_accounts` and returns `null` (the caller surfaces a clean
 *      error; that account then requires a fresh login).
 *   3. `signOut` removes the ACTIVE account from `saved_accounts`; if
 *      others remain, switches to the next one instead of ending up fully
 *      logged out (Instagram-style "close this account, land on another
 *      one you already had open"); only clears everything and truly signs
 *      out of Supabase when no saved account remains.
 *
 * Non-active accounts' tokens are simply unused (not rotated) while they
 * sit in `saved_accounts`, so they stay valid until the moment they're
 * switched to.
 */

const ACTIVE_BUSINESS_COOKIE_NAME = "active_business_id";
const SAVED_ACCOUNTS_COOKIE_NAME = "saved_accounts";

/**
 * Part 1b — caps `saved_accounts` at 2 device-local profiles (Instagram-style
 * "add another account" is meant for a couple of accounts, not an unbounded
 * list). Applied in `signIn` via `.slice(-MAX_SAVED_ACCOUNTS)` AFTER the
 * upsert(s): the just-signed-in account is always appended last, so it is
 * always kept — a 3rd distinct login evicts the OLDEST of the other two.
 */
const MAX_SAVED_ACCOUNTS = 2;

/**
 * Part C3 — both `active_business_id` and `saved_accounts` were session
 * cookies (cleared on browser close), which caused spurious re-logins on tab
 * reopen. 400 days matches the lifetime Chrome/browsers already cap
 * `Set-Cookie` `Max-Age`/`Expires` at, and mirrors `sb-*`'s own effective
 * cookie lifetime managed by `@supabase/ssr`.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/**
 * Part 2 — `active_business_id` is encrypted at rest (same AES-256-GCM
 * scheme as `saved_accounts`, `lib/server/cookie-crypto.ts`) for consistency,
 * even though its value isn't secret (it's always re-validated against
 * `BusinessRepository.listMembershipsForUser` on every read — see
 * `getSession` below; an attacker who somehow forged/edited it could at most
 * trigger the existing "fall back to memberships[0]" path, never fabricate a
 * membership/role that doesn't exist).
 */
async function setActiveBusinessCookie(businessId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BUSINESS_COOKIE_NAME, sealJson(businessId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

async function deleteActiveBusinessCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_BUSINESS_COOKIE_NAME);
}

/**
 * Fail-safe: `openJson` returns `null` for a malformed/tampered/unreadable
 * (including pre-encryption-era plaintext) cookie, which this maps to
 * `undefined` — identical to "cookie absent" — so `getSession` falls back to
 * `memberships[0]`, already the existing behavior for a missing cookie.
 */
async function readActiveBusinessCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_BUSINESS_COOKIE_NAME)?.value;
  if (!raw) {
    return undefined;
  }
  return openJson<string>(raw) ?? undefined;
}

/**
 * The FULL stored shape — includes the secret `refreshToken`. Never leaves
 * this file; `SavedAccount` (in `ports.ts`) is the public projection.
 */
type StoredAccount = {
  userId: string;
  email: string;
  label: string;
  refreshToken: string;
};

function isStoredAccount(value: unknown): value is StoredAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).userId === "string" &&
    typeof (value as Record<string, unknown>).email === "string" &&
    typeof (value as Record<string, unknown>).label === "string" &&
    typeof (value as Record<string, unknown>).refreshToken === "string"
  );
}

/**
 * Part C1 — `saved_accounts` carries refresh tokens, so its value is
 * AES-256-GCM encrypted at rest via `lib/server/cookie-crypto.ts` (on top of
 * `httpOnly`, which already blocks JS access). `openJson` is fail-safe
 * (returns `null` on any decryption/parse error), so a malformed/tampered/
 * pre-encryption-era (plaintext) cookie is treated as "no saved accounts" —
 * same posture as the old plaintext `JSON.parse` try/catch it replaces.
 */
async function readSavedAccounts(): Promise<StoredAccount[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SAVED_ACCOUNTS_COOKIE_NAME)?.value;
  if (!raw) {
    return [];
  }
  const parsed = openJson<unknown>(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isStoredAccount);
}

async function writeSavedAccounts(accounts: StoredAccount[]): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SAVED_ACCOUNTS_COOKIE_NAME, sealJson(accounts), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/** Replaces any existing entry for `account.userId` (never duplicates a userId). */
function upsertAccount(accounts: StoredAccount[], account: StoredAccount): StoredAccount[] {
  return [...accounts.filter((existing) => existing.userId !== account.userId), account];
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

/**
 * Shared core of `switchAccount` — also called by `signOut` to fall back to
 * the next saved account instead of ending up fully logged out. Assumes
 * `userId` is ALREADY known to be present in `accounts` by the caller (both
 * call sites re-read `saved_accounts` themselves beforehand); does its own
 * lookup regardless as a defensive re-check.
 */
async function performSwitchAccount(userId: string): Promise<Session | null> {
  const supabase = await createServerSupabaseClient();
  let accounts = await readSavedAccounts();

  const target = accounts.find((account) => account.userId === userId);
  if (!target) {
    return null;
  }

  // Step 1: capture the CURRENTLY-active account's live refresh token
  // BEFORE `refreshSession` below overwrites the `sb-*` cookie family, so
  // the account being left behind keeps a fresh, valid token.
  const { data: currentSessionData } = await supabase.auth.getSession();
  const currentSession = currentSessionData.session;
  if (currentSession?.user && currentSession.refresh_token) {
    accounts = upsertAccount(accounts, {
      userId: currentSession.user.id,
      email: currentSession.user.email!,
      label:
        accounts.find((account) => account.userId === currentSession.user!.id)?.label ??
        currentSession.user.email!,
      refreshToken: currentSession.refresh_token,
    });
  }

  // Step 2: exchange the target's stored refresh token for a fresh session
  // — `createServerSupabaseClient`'s `setAll` writes the new `sb-*` cookie
  // family as a side effect of this call.
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: target.refreshToken });
  if (error || !data.session || !data.user) {
    // Stale/invalid stored token: drop this account. Still persist step 1's
    // update for the account we stayed on.
    await writeSavedAccounts(accounts.filter((account) => account.userId !== userId));
    return null;
  }

  const memberships = await listMembershipsForUser(data.user.id);
  if (memberships.length === 0) {
    await writeSavedAccounts(accounts.filter((account) => account.userId !== userId));
    return null;
  }
  const active = memberships[0]!;

  // Step 3: re-save the target's entry with its NEW rotated refresh token.
  accounts = upsertAccount(accounts, {
    userId: data.user.id,
    email: data.user.email!,
    label: target.label,
    refreshToken: data.session.refresh_token,
  });
  await writeSavedAccounts(accounts);

  // Step 4: reset the active business to the switched-to account's first membership.
  await setActiveBusinessCookie(active.businessId);

  return {
    userId: data.user.id,
    businessId: active.businessId,
    email: data.user.email!,
    role: active.role,
  };
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

    // Capture the PREVIOUSLY-active account's live refresh token BEFORE
    // `signInWithPassword` overwrites the `sb-*` cookie family below — this
    // is what makes "add another account" (signing in as a NEW account
    // while already logged in as an existing one) keep the previous
    // account reachable in `saved_accounts` instead of silently losing it.
    const { data: previousSessionData } = await supabase.auth.getSession();
    const previousSession = previousSessionData.session;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
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

    let accounts = await readSavedAccounts();
    if (previousSession?.user && previousSession.user.id !== userId && previousSession.refresh_token) {
      accounts = upsertAccount(accounts, {
        userId: previousSession.user.id,
        email: previousSession.user.email!,
        label:
          accounts.find((account) => account.userId === previousSession.user!.id)?.label ??
          previousSession.user.email!,
        refreshToken: previousSession.refresh_token,
      });
    }
    accounts = upsertAccount(accounts, {
      userId,
      email: data.user.email!,
      label: data.user.email!,
      refreshToken: data.session.refresh_token,
    });
    // Part 1b: cap at MAX_SAVED_ACCOUNTS — the just-signed-in account was
    // appended last above, so it's always kept; the slice only evicts the
    // OLDEST of any others beyond the cap.
    accounts = accounts.slice(-MAX_SAVED_ACCOUNTS);
    await writeSavedAccounts(accounts);

    return {
      userId,
      businessId: active.businessId,
      email: data.user.email!,
      role: active.role,
    };
  },

  async signOut(): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const activeUserId = data.user?.id;

    const accounts = await readSavedAccounts();
    const remaining = activeUserId ? accounts.filter((account) => account.userId !== activeUserId) : accounts;

    // SECURITY: clear the departing account's local Supabase session FIRST,
    // BEFORE any switch-to-next below. Otherwise `performSwitchAccount`'s
    // "capture the currently-active token" step would read the still-present
    // `sb-*` cookies (they still belong to the account being signed out) and
    // silently re-`upsert` that account back into `saved_accounts` — leaving
    // it re-activatable without a password on the device. "Cerrar sesión"
    // must be a real removal boundary. `scope: "local"` clears only this
    // device's session (does not revoke the account's refresh token on its
    // OTHER devices).
    await supabase.auth.signOut({ scope: "local" });

    if (remaining.length > 0) {
      // Persist the pruned list BEFORE switching — `performSwitchAccount`
      // re-reads `saved_accounts` fresh and will further update the target's
      // entry with its own rotated refresh token. With the departing session
      // already cleared above, its "capture current token" step finds none,
      // so the signed-out account stays removed.
      await writeSavedAccounts(remaining);
      const switched = await performSwitchAccount(remaining[0]!.userId);
      if (switched) {
        // Stayed logged in — as the next saved account.
        return;
      }
    }

    await deleteActiveBusinessCookie();
    await writeSavedAccounts([]);
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

  async listSavedAccounts(): Promise<SavedAccount[]> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const activeUserId = data.user?.id;

    const accounts = await readSavedAccounts();
    return accounts.map((account) => ({
      userId: account.userId,
      email: account.email,
      label: account.label,
      active: account.userId === activeUserId,
    }));
  },

  async switchAccount(userId: string): Promise<Session | null> {
    return performSwitchAccount(userId);
  },

  async removeSavedAccount(userId: string): Promise<void> {
    const accounts = await readSavedAccounts();
    await writeSavedAccounts(accounts.filter((account) => account.userId !== userId));
  },
};
