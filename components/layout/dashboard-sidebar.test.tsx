import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import DashboardSidebar from "./dashboard-sidebar";

/**
 * `role` prop (a plain string, per the "Server Component can't pass a
 * `NavItem[]` — it carries `lucide-react` icon component references —
 * across the client boundary" fix): `DashboardSidebar` filters `NAV_ITEMS`
 * internally via `navItemsForRole`, so `app/(dashboard)/layout.tsx` only
 * ever needs to pass `session.role`.
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
});
