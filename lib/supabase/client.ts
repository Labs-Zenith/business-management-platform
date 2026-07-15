import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";

/**
 * Browser Supabase client, for any future client-side use (e.g. realtime
 * subscriptions). Kept minimal — the app currently does all auth through
 * server-side routes (`app/api/auth/*`) via `lib/supabase/auth-adapter.ts`,
 * so nothing calls this yet.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
