import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

import DashboardLayout from "./layout";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
};

/**
 * Consistent with `app/(dashboard)/settings/page.test.tsx` (PR3)'s pattern:
 * mock `@/lib/session`, resolve/reject `requireSession()`, and assert
 * defense-in-depth propagation.
 */
describe("DashboardLayout (shared navigation shell)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
  });

  it("resolves the session, then renders links to every dashboard section, the page content, and a logout action", async () => {
    mockRequireSession.mockResolvedValue(SESSION);

    render(await DashboardLayout({ children: <div>Page content</div> }));

    expect(mockRequireSession).toHaveBeenCalled();
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

  it("propagates requireSession's UNAUTHENTICATED rejection instead of rendering the shell (defense in depth)", async () => {
    mockRequireSession.mockRejectedValue(
      new ApiError("UNAUTHENTICATED", "Authentication required.")
    );

    await expect(
      DashboardLayout({ children: <div>Page content</div> })
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
