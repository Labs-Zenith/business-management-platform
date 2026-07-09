import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { store, serializeStore, hydrateStore, type SerializedStore } from "./store";
import { seedMinimal } from "./fixtures";

/**
 * Persists the mock store's data across requests via an httpOnly cookie,
 * separate from the auth `session` cookie. Exists because Vercel's
 * serverless functions are ephemeral across instances — the plain
 * `globalThis`-cached store (`store.ts`) only survives within a single
 * warm instance/process, so a mutation (e.g. a payment) can appear lost
 * once a request lands on a different or recycled instance.
 *
 * Trade-off (deliberate, see the SDD proposal for this change): no
 * external DB, works today, but only for the single browser/session that
 * created the data — doesn't fit the full ~8-customer/~12-invoice demo
 * fixture set (see `seedMinimal`), and a cookie has a hard ~4KB size
 * ceiling, so this is a mocked-demo convenience, not a real backend.
 */
const COOKIE_NAME = "app_data";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 1 week

/** Reads `app_data`, hydrating the shared store from it, or seeds minimal data if absent/corrupt. */
export async function loadStoreFromCookie(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (raw) {
    try {
      hydrateStore(JSON.parse(raw) as SerializedStore);
      return;
    } catch {
      // Corrupt/incompatible cookie — fall through and reseed.
    }
  }
  seedMinimal(store);
}

/** Serializes the current store state onto `response` as the `app_data` cookie. */
export function saveStoreToCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, JSON.stringify(serializeStore()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
