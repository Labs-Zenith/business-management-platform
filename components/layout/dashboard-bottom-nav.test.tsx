import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import type { NavItem } from "./nav-items";
import { NAV_ITEMS } from "./nav-items";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import DashboardBottomNav, { gridColsClass } from "./dashboard-bottom-nav";

/**
 * `gridColsClass`, per `design.md`'s "Open Questions — Bottom-nav column
 * count" resolution: Tailwind cannot safelist a dynamically interpolated
 * `grid-cols-${n}` class, so the lookup is a static `Record<number,string>`
 * map. Extracted to a pure function (per the strict-TDD "extract before
 * assert on CSS" rule) so the class-selection LOGIC is tested directly,
 * without asserting className strings inside a render test.
 */
describe("gridColsClass", () => {
  it("maps 6 items (worker's filtered nav, including Inventario) to grid-cols-6", () => {
    expect(gridColsClass(6)).toBe("grid-cols-6");
  });

  it("maps 7 items (admin's full nav, including Nómina and Inventario) to grid-cols-7", () => {
    expect(gridColsClass(7)).toBe("grid-cols-7");
  });

  it("falls back to grid-cols-5 for an unmapped item count", () => {
    expect(gridColsClass(3)).toBe("grid-cols-5");
  });
});

describe("DashboardBottomNav", () => {
  it("renders every default NAV_ITEMS link when no items prop is passed (backward-compatible), 7 items total (admin's list, including Nómina and Inventario)", () => {
    render(<DashboardBottomNav />);

    expect(NAV_ITEMS.length).toBe(7);
    for (const label of ["Dashboard", "Clientes", "Facturas", "Pagos", "Nómina", "Inventario", "Negocio"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders only the items in a worker-filtered 6-item list (excludes Nómina, keeps Inventario)", () => {
    const workerItems: NavItem[] = NAV_ITEMS.filter((item) => item.href !== "/nomina");
    expect(workerItems.length).toBe(6);

    render(<DashboardBottomNav items={workerItems} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("renders exactly the number of links passed via items, regardless of count (1-item list)", () => {
    const singleItem: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

    render(<DashboardBottomNav items={singleItem} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
