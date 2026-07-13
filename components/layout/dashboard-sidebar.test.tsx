import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import DashboardSidebar from "./dashboard-sidebar";
import { SIDEBAR_COLLAPSED_COOKIE } from "./nav-items";

/**
 * `role` prop (a plain string, per the "Server Component can't pass a
 * `NavItem[]` — it carries `lucide-react` icon component references —
 * across the client boundary" fix): `DashboardSidebar` filters `NAV_ITEMS`
 * internally via `navItemsForRole`, so `app/(dashboard)/layout.tsx` only
 * ever needs to pass `session.role`.
 *
 * `defaultCollapsed` (Fase 4 Lane C — desktop sidebar collapse toggle) is
 * read server-side from the `sidebar_collapsed` cookie by
 * `app/(dashboard)/layout.tsx` and passed down here as the initial React
 * state, avoiding a hydration flash; the toggle button then flips local
 * state AND writes the cookie via `document.cookie`, exercised below via
 * a `document.cookie` assertion (the only observable proof the write
 * happened, short of mocking `document.cookie`'s setter entirely).
 */
describe("DashboardSidebar", () => {
  it("renders every NAV_ITEMS link for an admin role (full list, including Nómina and Inventario)", () => {
    render(<DashboardSidebar role="admin" />);

    for (const label of ["Dashboard", "Clientes", "Facturas", "Pagos", "Nómina", "Inventario", "Negocio"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the worker-filtered list (excludes Nómina, keeps Inventario)", () => {
    render(<DashboardSidebar role="worker" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("expands by default (labels visible, toggle offers to collapse) when defaultCollapsed is not passed", () => {
    render(<DashboardSidebar role="admin" />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });

  it("starts collapsed (labels hidden, each link exposes its label via title) when defaultCollapsed is true", () => {
    render(<DashboardSidebar role="admin" defaultCollapsed />);

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink).toHaveAttribute("title", "Dashboard");
    expect(screen.getByRole("button", { name: /expandir barra lateral/i })).toBeInTheDocument();
  });

  it("toggles from expanded to collapsed on click, hiding labels and persisting the choice in the sidebar_collapsed cookie", async () => {
    const user = userEvent.setup();
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=; max-age=0`;
    render(<DashboardSidebar role="admin" />);

    await user.click(screen.getByRole("button", { name: /colapsar barra lateral/i }));

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("title", "Dashboard");
    expect(document.cookie).toContain(`${SIDEBAR_COLLAPSED_COOKIE}=true`);
    expect(screen.getByRole("button", { name: /expandir barra lateral/i })).toBeInTheDocument();
  });

  it("toggles from collapsed back to expanded on click, restoring labels and updating the cookie", async () => {
    const user = userEvent.setup();
    render(<DashboardSidebar role="admin" defaultCollapsed />);

    await user.click(screen.getByRole("button", { name: /expandir barra lateral/i }));

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(document.cookie).toContain(`${SIDEBAR_COLLAPSED_COOKIE}=false`);
    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });
});
