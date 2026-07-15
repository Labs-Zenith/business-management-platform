import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { AuthUser } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";

/**
 * Standard `@supabase/ssr` Next.js middleware helper: refreshes the Supabase
 * auth cookie (if the access token is near/past expiry) and resolves the
 * current user. `middleware.ts` calls this when `isSupabaseConfigured` is
 * true, in place of the mock's simple cookie-presence check.
 *
 * Cookies read/written against `request`/`response` (edge-compatible — no
 * `next/headers`, which is bound to the RSC request context, not available
 * in middleware). Per the `@supabase/ssr` docs: `setAll` must re-create
 * `response` with the mutated `request` so the refreshed cookies are visible
 * both to the request continuing downstream and to the client via the
 * response's `Set-Cookie` headers.
 */
export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; user: AuthUser | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
