import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

// `loadStoreFromCookie` calls `next/headers`'s `cookies()`, unavailable
// outside a real Next.js request context — irrelevant to this layout's own
// nav/session-gating behavior under test.
vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

import DashboardLayout from "./layout";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

/**
 * Consistent with `app/(dashboard)/settings/page.test.tsx` (PR3)'s pattern:
 * mock `@/lib/session`, resolve/reject `requireSessionOrRedirect()`, and
 * assert defense-in-depth propagation.
 */
describe("DashboardLayout (shared navigation shell)", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
  });

  it("resolves the session, then renders links to every dashboard section, the page content, and a logout action", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);

    render(await DashboardLayout({ children: <div>Page content</div> }));

    expect(mockRequireSessionOrRedirect).toHaveBeenCalled();
    expect(screen.getByText("Page content")).toBeInTheDocument();

    for (const label of ["Dashboard", "Clientes", "Facturas", "Pagos", "Negocio"]) {
      const links = screen.getAllByRole("link", { name: label });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute(
          "href",
          label === "Dashboard"
            ? "/dashboard"
            : label === "Clientes"
              ? "/customers"
              : label === "Facturas"
                ? "/invoices"
                : label === "Pagos"
                  ? "/payments"
                  : "/settings"
        );
      }
    }

    expect(screen.getByRole("button", { name: /cerrar sesion/i })).toBeInTheDocument();
  });

  it("redirects to /login instead of rendering the shell when there is no valid session (defense in depth) — a stale/role-less cookie must not crash this layout", async () => {
    // `requireSessionOrRedirect()` never resolves in the unauthenticated
    // case — it calls `next/navigation`'s `redirect("/login")`, which
    // throws Next's internal `NEXT_REDIRECT` signal (a real redirect the
    // framework handles natively, not a crash). Simulated here the same way
    // `ApiError` was simulated before this fix.
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(
      DashboardLayout({ children: <div>Page content</div> })
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});
