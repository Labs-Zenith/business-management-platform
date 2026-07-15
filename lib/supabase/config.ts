/**
 * Supabase configuration + env resolution (Fase 2 of the Supabase migration —
 * see `docs/db-driver-migration.md`).
 *
 * `isSupabaseConfigured` is the single gate `lib/services/repositories.ts`
 * and `middleware.ts` use to decide whether the real Supabase Auth adapter
 * (`lib/supabase/auth-adapter.ts`) replaces the mock adapter
 * (`lib/mock/auth-adapter.ts`). Local dev/tests without these env vars set
 * keep using the mock exactly as before.
 *
 * The three getters below throw (fail loud) if called while their backing
 * env var is unset, rather than silently constructing a client against an
 * empty string URL/key — mirroring `lib/mock/auth-adapter.ts`'s
 * `resolveSessionSecret` fail-loud pattern.
 */

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required when Supabase is configured (see .env.example).`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
