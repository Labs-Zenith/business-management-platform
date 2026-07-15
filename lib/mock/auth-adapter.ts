import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthPort, Role, SavedAccount, Session } from "@/lib/services/ports";
import { store as defaultStore, listProfilesForUser, type MockStore } from "./store";

const SESSION_COOKIE_NAME = "session";

/**
 * Wave 3 — Multi-account instant switching, mock-adapter equivalent. The
 * mock's `signIn` only ever accepts ONE hardcoded demo credential pair
 * (`resolveDemoCredentials`), so a real dev session can never actually
 * authenticate a SECOND distinct account through the login form — this
 * mechanism exists so the `AuthPort` shape and its tests (which seed
 * `saved_accounts` directly) work identically to the real Supabase adapter,
 * not to offer a realistic multi-account demo.
 *
 * Unlike Supabase, the mock's own session cookie is already a signed,
 * self-contained `Session` (see `encodeSession`/`decodeSession` below) — no
 * refresh-token rotation exists here, so `saved_accounts` only needs to
 * remember `{userId, email, label}` per account. `switchAccount` re-derives
 * a fresh signed session cookie directly from `store.profiles` for the
 * target `userId` (that user's earliest-created membership), rather than
 * re-authenticating with a password.
 */
const SAVED_ACCOUNTS_COOKIE_NAME = "saved_accounts";

type MockStoredAccount = { userId: string; email: string; label: string };

function isMockStoredAccount(value: unknown): value is MockStoredAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).userId === "string" &&
    typeof (value as Record<string, unknown>).email === "string" &&
    typeof (value as Record<string, unknown>).label === "string"
  );
}

async function readSavedAccounts(): Promise<MockStoredAccount[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SAVED_ACCOUNTS_COOKIE_NAME)?.value;
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isMockStoredAccount);
  } catch {
    return [];
  }
}

async function writeSavedAccounts(accounts: MockStoredAccount[]): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SAVED_ACCOUNTS_COOKIE_NAME, JSON.stringify(accounts), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

function upsertAccount(accounts: MockStoredAccount[], account: MockStoredAccount): MockStoredAccount[] {
  return [...accounts.filter((existing) => existing.userId !== account.userId), account];
}

/**
 * Local dev/test-only signing fallback. NEVER used in production — see
 * `resolveSessionSecret` below, which throws (fail loud, not silent) the
 * first time a cookie is actually signed/verified if
 * `NODE_ENV === "production"` and `SESSION_SECRET` is unset, rather than
 * silently signing production cookies with this well-known value.
 *
 * Resolved LAZILY (memoized on first use) rather than eagerly at module
 * load: `next build`'s "Collecting page data" step sets
 * `NODE_ENV=production` and imports this module (transitively, via
 * `lib/services/repositories.ts`) WITHOUT ever serving a real request — an
 * eager top-level throw here would fail every production build, not just
 * an actually-misconfigured production runtime. Resolving on first
 * sign/verify call still fails loud before any cookie is ever issued or
 * accepted with the insecure fallback in a real deployment.
 */
const DEV_FALLBACK_SESSION_SECRET = "dev-insecure-session-secret-do-not-use-in-production";

let cachedSessionSecret: string | null = null;

function resolveSessionSecret(): string {
  if (cachedSessionSecret !== null) {
    return cachedSessionSecret;
  }
  const configured = process.env.SESSION_SECRET;
  if (configured) {
    cachedSessionSecret = configured;
    return cachedSessionSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production (see .env.example) — refusing to " +
        "sign session cookies with the known dev fallback secret."
    );
  }
  cachedSessionSecret = DEV_FALLBACK_SESSION_SECRET;
  return cachedSessionSecret;
}

function sign(payloadBase64Url: string): string {
  return createHmac("sha256", resolveSessionSecret()).update(payloadBase64Url).digest("base64url");
}

/**
 * Default demo credential pair, overridable via `DEMO_LOGIN_EMAIL` /
 * `DEMO_LOGIN_PASSWORD` (see `.env.example`). The default email matches
 * the seeded demo profile in `lib/mock/fixtures/data.ts`.
 */
function resolveDemoCredentials(): { email: string; password: string } {
  return {
    email: process.env.DEMO_LOGIN_EMAIL || "demo@negociodemo.test",
    password: process.env.DEMO_LOGIN_PASSWORD || "demo1234",
  };
}

/**
 * Opaque, HMAC-SHA256-SIGNED cookie value: `${base64Payload}.${signature}`,
 * where `payload` is base64url-encoded JSON of the `Session` and `signature`
 * is `HMAC-SHA256(payload, SESSION_SECRET)` (base64url). It is "opaque" to
 * the browser (httpOnly, never read by client JS) AND tamper-evident — a
 * hand-edited payload (e.g. `role` changed to `"admin"`) fails the signature
 * check in `decodeSession` and is rejected. The real Supabase swap replaces
 * this entirely with Supabase's own signed/verified auth cookies.
 */
function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string): Session | null {
  try {
    const lastDot = token.lastIndexOf(".");
    if (lastDot === -1) {
      return null;
    }
    const payload = token.slice(0, lastDot);
    const signature = token.slice(lastDot + 1);

    const expected = Buffer.from(sign(payload), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }

    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).userId === "string" &&
      typeof (parsed as Record<string, unknown>).businessId === "string" &&
      typeof (parsed as Record<string, unknown>).email === "string" &&
      typeof (parsed as Record<string, unknown>).role === "string"
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}

/** Encodes and sets the session cookie. Shared by `signIn` and `switchBusiness`. */
async function setCookie(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Shared core of `switchAccount` — also called by `signOut` to fall back to
 * the next saved account instead of ending up fully logged out. Unlike the
 * Supabase adapter, there is no token to rotate: re-derives a fresh signed
 * session cookie directly from `store.profiles` for `userId`'s
 * earliest-created membership.
 */
async function performSwitchAccount(store: MockStore, userId: string): Promise<Session | null> {
  const accounts = await readSavedAccounts();
  const target = accounts.find((account) => account.userId === userId);
  if (!target) {
    return null;
  }

  const profiles = listProfilesForUser(store, userId);
  if (profiles.length === 0) {
    // Stale saved account (e.g. the store was reset) — drop it rather than
    // switching to a session that no longer has any membership.
    await writeSavedAccounts(accounts.filter((account) => account.userId !== userId));
    return null;
  }
  const defaultProfile = profiles[0]!;

  const session: Session = {
    userId: defaultProfile.userId,
    businessId: defaultProfile.businessId,
    email: defaultProfile.email,
    role: defaultProfile.role,
  };

  await setCookie(session);

  return session;
}

export function createAuthAdapter(store: MockStore): AuthPort {
  return {
    async getSession(): Promise<Session | null> {
      const cookieStore = await cookies();
      const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (!token) {
        return null;
      }
      return decodeSession(token);
    },

    async signIn(email: string, password: string): Promise<Session | null> {
      const demo = resolveDemoCredentials();
      if (email !== demo.email || password !== demo.password) {
        return null;
      }

      const profile = [...store.profiles.values()].find((candidate) => candidate.email === demo.email);
      if (!profile) {
        return null;
      }

      // A user may hold N memberships (profiles); the default active
      // business at login is the earliest one by `createdAt` ascending.
      const defaultProfile = listProfilesForUser(store, profile.userId)[0]!;

      const session: Session = {
        userId: defaultProfile.userId,
        businessId: defaultProfile.businessId,
        email: defaultProfile.email,
        role: defaultProfile.role,
      };

      await setCookie(session);

      // Wave 3: append/update this account's entry in `saved_accounts` so
      // it's instantly reachable via `switchAccount` afterwards, mirroring
      // `lib/supabase/auth-adapter.ts#signIn`.
      const savedAccounts = await readSavedAccounts();
      await writeSavedAccounts(
        upsertAccount(savedAccounts, {
          userId: defaultProfile.userId,
          email: defaultProfile.email,
          label: defaultProfile.email,
        })
      );

      return session;
    },

    async signOut(): Promise<void> {
      const cookieStore = await cookies();
      const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      const current = token ? decodeSession(token) : null;

      const savedAccounts = await readSavedAccounts();
      const remaining = current
        ? savedAccounts.filter((account) => account.userId !== current.userId)
        : savedAccounts;

      if (remaining.length > 0) {
        await writeSavedAccounts(remaining);
        const switched = await performSwitchAccount(store, remaining[0]!.userId);
        if (switched) {
          // Stayed logged in — as the next saved account.
          return;
        }
      }

      cookieStore.delete(SESSION_COOKIE_NAME);
      await writeSavedAccounts([]);
    },

    /**
     * Pure session/cookie mechanics — performs NO membership or authorization
     * check of its own. See the `AuthPort.switchBusiness` JSDoc
     * (`lib/services/ports.ts`) for the full security contract: the caller
     * (the switch-business route) is solely responsible for verifying
     * `role` against a backend-aware `BusinessRepository.listMembershipsForUser`
     * lookup before calling this.
     */
    async switchBusiness(businessId: string, role: Role): Promise<Session | null> {
      const cookieStore = await cookies();
      const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (!token) {
        return null;
      }
      const current = decodeSession(token);
      if (!current) {
        return null;
      }

      const session: Session = {
        userId: current.userId,
        email: current.email,
        businessId,
        role,
      };

      await setCookie(session);

      return session;
    },

    async listSavedAccounts(): Promise<SavedAccount[]> {
      const cookieStore = await cookies();
      const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      const current = token ? decodeSession(token) : null;

      const savedAccounts = await readSavedAccounts();
      return savedAccounts.map((account) => ({
        userId: account.userId,
        email: account.email,
        label: account.label,
        active: account.userId === current?.userId,
      }));
    },

    async switchAccount(userId: string): Promise<Session | null> {
      return performSwitchAccount(store, userId);
    },
  };
}

export const authAdapter: AuthPort = createAuthAdapter(defaultStore);
