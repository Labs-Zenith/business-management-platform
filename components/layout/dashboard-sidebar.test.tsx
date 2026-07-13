import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import type { NavItem } from "./nav-items";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import DashboardSidebar from "./dashboard-sidebar";

/**
 * `items` prop, per `design.md`'s "Capability-tagged nav item +
 * navItemsForRole filter" decision — additive/backward-compatible (defaults
 * to `NAV_ITEMS`) so existing callers keep working, but a caller (here,
 * `app/(dashboard)/layout.tsx`) can pass an already role-filtered list.
 */
describe("DashboardSidebar", () => {
  it("renders every default NAV_ITEMS link when no items prop is passed (backward-compatible)", () => {
    render(<DashboardSidebar />);

    for (const label of ["Dashboard", "Clientes", "Facturas", "Pagos", "Nómina", "Inventario", "Negocio"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders only the items in a worker-filtered list (excludes Nómina)", () => {
    const workerItems: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

    render(<DashboardSidebar items={workerItems} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });
});
