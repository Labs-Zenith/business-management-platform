/**
 * Session resolution helpers built on top of the `AuthPort` seam
 * (`lib/services/ports.ts`), wired through `lib/services/repositories.ts`.
 *
 * UI Server Components and API route handlers must resolve `business_id`
 * ONLY through these helpers — never by decoding cookies directly — per
 * `docs/security-plan.md`'s "el backend siempre resuelve el negocio desde
 * la sesion" rule.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { Session } from "@/lib/services/ports";

/** Returns the current session, or `null` if absent/invalid. Never throws. */
export async function getSession(): Promise<Session | null> {
  return repositories.auth.getSession();
}

/**
 * Returns the current session, or throws an `UNAUTHENTICATED` `ApiError`
 * (401) if none is present. Every protected page/API route MUST call this
 * (defense in depth) rather than relying solely on `middleware.ts`.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required.");
  }
  return session;
}
