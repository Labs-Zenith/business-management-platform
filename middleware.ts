import { NextResponse, type NextRequest } from "next/server";

/**
 * Must match the cookie name set by `lib/mock/auth-adapter.ts`. Duplicated
 * here (rather than imported) so `middleware.ts` never imports anything
 * under `lib/mock/**` — see the ports-and-adapters boundary comment at the
 * top of `lib/services/ports.ts`.
 */
const SESSION_COOKIE_NAME = "session";

/**
 * Top-level path prefixes belonging to the `(dashboard)` and `(print)`
 * route groups (Next.js route groups don't appear in the URL), plus
 * `/api/docs`. See `docs/ui-ux-flow.md` and `design.md`'s File Layout.
 *
 * This is a lightweight presence check only — the authoritative guard is
 * `requireSession()` (`lib/session.ts`), which every protected page and API
 * route MUST also call (defense in depth), per `docs/security-plan.md`.
 */
const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/customers",
  "/invoices",
  "/payments",
  "/settings",
  "/api/docs",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/invoices/:path*",
    "/payments/:path*",
    "/settings/:path*",
    "/api/docs/:path*",
  ],
};
