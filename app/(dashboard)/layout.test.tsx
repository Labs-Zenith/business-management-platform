import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BusinessMembership, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListMembershipsForUser = vi.fn<(userId: string) => Promise<BusinessMembership[]>>();

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// `loadStoreFromCookie` calls `next/headers`'s `cookies()`, unavailable
// outside a real Next.js request context — irrelevant to this layout's own
// nav/session-gating behavior under test.
vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

// `repositories.business.listMembershipsForUser` is called directly by this
// layout (Phase 7, `roles-multi-business`) to pass `memberships` down to
// `DashboardTopbar`'s `BusinessSwitcher` — mocked here the same way
// `requireSessionOrRedirect` is, since the real repository would otherwise
// hit the mock store's cookie-hydration path.
vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    business: {
      listMembershipsForUser: (userId: string) => mockListMembershipsForUser(userId),
    },
  },
}));

import DashboardLayout from "./layout";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const SINGLE_MEMBERSHIP: BusinessMembership[] = [
  { businessId: SESSION.businessId, businessName: "Negocio Demo", role: "admin" },
];

/**
 * Consistent with `app/(dashboard)/settings/page.test.tsx` (PR3)'s pattern:
 * mock `@/lib/session`, resolve/reject `requireSessionOrRedirect()`, and
 * assert defense-in-depth propagation.
 */
describe("DashboardLayout (shared navigation shell)", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockListMembershipsForUser.mockReset();
  });

  it("resolves the session, then renders links to every dashboard section, the page content, and a logout action", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListMembershipsForUser.mockResolvedValue(SINGLE_MEMBERSHIP);

    render(await DashboardLayout({ children: <div>Page content</div> }));

    expect(mockRequireSessionOrRedirect).toHaveBeenCalled();
    expect(mockListMembershipsForUser).toHaveBeenCalledWith(SESSION.userId);
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

  it("currently propagates (crashes the shell) when listMembershipsForUser rejects — documents existing behavior, not a fix", async () => {
    // Unlike `requireSessionOrRedirect()`'s rejection above (a real Next.js
    // redirect signal), `listMembershipsForUser` has no try/catch around it
    // in `layout.tsx`: a rejection here throws straight out of this Server
    // Component with no `error.tsx`/`global-error.tsx` boundary for this
    // route group. This test locks in that CURRENT behavior so it isn't a
    // silent, unverified gap; whether to gracefully degrade instead (e.g.
    // render with an empty `memberships` list) is a product decision left
    // for a future change, not this fix pass.
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListMembershipsForUser.mockRejectedValue(new Error("db unavailable"));

    await expect(
      DashboardLayout({ children: <div>Page content</div> })
    ).rejects.toThrow("db unavailable");
  });
});
