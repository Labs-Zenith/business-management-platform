/**
 * Session resolution helpers built on top of the `AuthPort` seam
 * (`lib/services/ports.ts`), wired through `lib/services/repositories.ts`.
 *
 * UI Server Components and API route handlers must resolve `business_id`
 * ONLY through these helpers — never by decoding cookies directly — per
 * `docs/security-plan.md`'s "el backend siempre resuelve el negocio desde
 * la sesion" rule.
 */

import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import { can, type Capability } from "@/lib/services/permissions";
import type { Session } from "@/lib/services/ports";

/** Returns the current session, or `null` if absent/invalid. Never throws. */
export async function getSession(): Promise<Session | null> {
  return repositories.auth.getSession();
}

/**
 * Returns the current session, or throws an `UNAUTHENTICATED` `ApiError`
 * (401) if none is present. API ROUTE HANDLERS MUST call this — their
 * response wrapper catches `ApiError` and turns it into a 401 JSON body.
 *
 * Server Component pages/layouts must NOT call this directly — there is no
 * `error.tsx`/`global-error.tsx` in this tree, so a thrown `ApiError` there
 * becomes Next's generic crash page instead of a redirect. Use
 * `requireSessionOrRedirect()` in Server Components instead.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required.");
  }
  return session;
}

/**
 * Returns the current session, or redirects to `/login` (via `next/navigation`'s
 * `redirect()`, which throws Next's special `NEXT_REDIRECT` signal — a real
 * redirect, handled natively by the framework, not a crash) if none is
 * present. Every protected Server Component page/layout MUST call this
 * (defense in depth alongside `middleware.ts`) instead of `requireSession()`,
 * which is reserved for API route handlers.
 */
export async function requireSessionOrRedirect(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Nomina (payroll) is the app's FIRST role-gated feature. `requireCapability`
 * and `requireCapabilityOrNotFound` are the reusable enforcement helpers
 * every gated API route and page must call, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`'s
 * "Reusable Capability-Check Helpers" requirement — no route/page should
 * inline its own `if (!can(...))` check (drift risk).
 *
 * Both resolve the session THEMSELVES (mirroring `requireSession`'s /
 * `requireSessionOrRedirect`'s own single-call ergonomics) rather than
 * taking an already-resolved `Session` as a parameter, so a call site is a
 * single line: `const session = await requireCapability("viewPayroll");`.
 */

/**
 * API ROUTE HANDLERS: resolves the session via `requireSession()` (401 if
 * absent), then throws a `FORBIDDEN` `ApiError` (403) if the session's role
 * lacks `capability`. Returns the session so the caller doesn't need a
 * second `requireSession()` call.
 */
export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await requireSession();
  if (!can(session.role, capability)) {
    throw new ApiError("FORBIDDEN", "You do not have access to this resource.");
  }
  return session;
}

/**
 * SERVER COMPONENT PAGES: resolves the session via
 * `requireSessionOrRedirect()` (redirects to `/login` if absent), then calls
 * `notFound()` if the session's role lacks `capability` — a worker hitting a
 * gated page URL directly gets a 404, not a redirect (which would be
 * confusing for an already-authenticated user and would disclose that the
 * feature exists). Returns the session so the caller doesn't need a second
 * `requireSessionOrRedirect()` call.
 */
export async function requireCapabilityOrNotFound(capability: Capability): Promise<Session> {
  const session = await requireSessionOrRedirect();
  if (!can(session.role, capability)) {
    notFound();
  }
  return session;
}
