/**
 * Shared, environment-neutral (NOT `"use client"`) guard for the login
 * `?next=<path>` redirect target, so BOTH the server `/login` gate
 * (`app/(auth)/login/page.tsx`) and the client `<LoginForm>`
 * (`components/domain/auth/login-form.tsx`) can call it — a `"use client"`
 * module can't export a function the server is allowed to invoke.
 *
 * Only a same-origin relative path (starting with a single `/`) is ever
 * honored as a post-login redirect target — this is the "Agregar cuenta"
 * flow's `?next=<path>` (see `components/layout/business-switcher.tsx`), NOT
 * an arbitrary caller-controlled value, so this guards against an open
 * redirect (`//evil.com`, `https://evil.com`, etc.) smuggled through the
 * query string.
 */
export function sanitizeNextPath(next: string | null): string | null {
  // Only a same-origin ABSOLUTE path is honored. Reject: non-`/`-leading
  // values, `//host` (protocol-relative), and ANY backslash — browsers'
  // WHATWG URL parser treats `\` like `/`, so `/\evil.com` would normalize to
  // `https://evil.com` and `router.push` it as a full external navigation
  // (open-redirect). A legitimate in-app path never contains a backslash.
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  return next;
}
