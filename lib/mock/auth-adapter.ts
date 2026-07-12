import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthPort, Role, Session } from "@/lib/services/ports";
import { store as defaultStore, listProfilesForUser, type MockStore } from "./store";

const SESSION_COOKIE_NAME = "session";

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

      return session;
    },

    async signOut(): Promise<void> {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
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
  };
}

export const authAdapter: AuthPort = createAuthAdapter(defaultStore);
