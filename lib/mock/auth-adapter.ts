import { cookies } from "next/headers";
import type { AuthPort, Session } from "@/lib/services/ports";
import { store as defaultStore, type MockStore } from "./store";

const SESSION_COOKIE_NAME = "session";

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
 * Opaque cookie value: base64url-encoded JSON of the `Session`. It is
 * "opaque" to the browser (httpOnly, never read by client JS) but not
 * cryptographically signed — acceptable for this mock; the real Supabase
 * swap replaces this entirely with signed/verified auth cookies.
 */
function encodeSession(session: Session): string {
  return Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
}

function decodeSession(token: string): Session | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).userId === "string" &&
      typeof (parsed as Record<string, unknown>).businessId === "string" &&
      typeof (parsed as Record<string, unknown>).email === "string"
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
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

      const session: Session = {
        userId: profile.userId,
        businessId: profile.businessId,
        email: profile.email,
      };

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      });

      return session;
    },

    async signOut(): Promise<void> {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
    },
  };
}

export const authAdapter: AuthPort = createAuthAdapter(defaultStore);
