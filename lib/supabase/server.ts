import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "./config";

/**
 * Server-side Supabase client bound to the current request's cookies via
 * Next 16's `cookies()` (`next/headers`) — the modern `@supabase/ssr`
 * `getAll`/`setAll` cookie interface (the deprecated `get`/`set`/`remove`
 * trio is NOT used).
 *
 * Must be constructed fresh per request/render (never module-level cached) —
 * `cookies()` is bound to the request's AsyncLocalStorage context.
 *
 * `setAll` is wrapped in a try/catch: called from a Server Component render,
 * `cookieStore.set` throws because cookies are read-only there. That's
 * expected and safe to swallow — `middleware.ts`'s `updateSession` (backed by
 * `lib/supabase/middleware.ts`) is the one actually responsible for
 * refreshing the auth cookie on the response, per the standard `@supabase/ssr`
 * Next.js pattern.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Read-only cookies() context (Server Component render) — no-op.
        }
      },
    },
    // Part C2 — `lib/supabase/client.ts` (the browser Supabase client) is
    // unused; ALL auth is server-side. That makes it safe to mark the
    // `sb-*` auth cookies httpOnly, closing the XSS token-theft vector
    // (default `@supabase/ssr` behavior is `httpOnly: false`). Must match
    // `lib/supabase/middleware.ts`'s `cookieOptions` exactly — otherwise the
    // flags diverge whichever site last rewrote the cookie.
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });
}

/**
 * Privileged, cookie-less Supabase client authenticated with the
 * SERVICE_ROLE key. Server-only — never import this from client code or
 * expose the key to the browser. `persistSession: false` because there is no
 * end-user session to persist; this client authenticates AS the service
 * role itself.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
}
