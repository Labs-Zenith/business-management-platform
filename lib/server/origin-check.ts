/**
 * CSRF-style protection for mutating (non-GET) API routes, per
 * `docs/api-spec.md`'s conventions: "los endpoints de mutacion deben aceptar
 * solo Content-Type: application/json" and "las mutaciones autenticadas por
 * cookie deben validar Origin o Referer contra el origen configurado de la
 * app". Session cookies are the auth mechanism for every route in this app,
 * so every mutating route MUST call this (after `requireSession()`, before
 * touching the mock store).
 *
 * Scope note (PR4): `app/api/auth/{login,logout}/route.ts` (added in PR2,
 * before this module existed) do NOT yet call `checkOrigin` — a documented
 * gap from that batch. This batch wires it into the customers mutation
 * routes only, per the orchestrator's explicit instruction not to
 * retroactively touch login/logout here. Login/logout SHOULD adopt
 * `checkOrigin` in a later batch for consistency (flagged, not fixed now).
 */

import { ApiError } from "@/lib/server/api-error";

/**
 * Throws `VALIDATION_ERROR` if the request's `Content-Type` is not
 * `application/json`, or `FORBIDDEN` if neither the `Origin` nor `Referer`
 * header (in that preference order) starts with the configured
 * `APP_ORIGIN`.
 *
 * If `APP_ORIGIN` is not configured, behavior depends on the environment:
 * in production it throws (fails CLOSED) — `switch-account` now authorizes on
 * cookie-possession + this origin check alone (no prior session), so silently
 * skipping the Origin/Referer check in prod would weaken CSRF protection to
 * just the Content-Type gate + SameSite=Lax; `APP_ORIGIN` is therefore a
 * required production env var (same posture as `COOKIE_SECRET`/
 * `SESSION_SECRET`). In non-production (local dev without a `.env`) it fails
 * OPEN — skipped rather than blocking every mutation — since there is nothing
 * to validate against.
 */
export function checkOrigin(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError("VALIDATION_ERROR", "Content-Type must be application/json.");
  }

  const expectedOrigin = process.env.APP_ORIGIN;
  if (!expectedOrigin) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(
        "INTERNAL_ERROR",
        "APP_ORIGIN must be configured in production (CSRF origin check cannot fail open)."
      );
    }
    return;
  }

  const candidate = request.headers.get("origin") ?? request.headers.get("referer");
  if (!candidate || !candidate.startsWith(expectedOrigin)) {
    throw new ApiError("FORBIDDEN", "Origin or Referer header does not match the configured app origin.");
  }
}
