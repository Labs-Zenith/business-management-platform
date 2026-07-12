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
  it("maps 5 items (worker's filtered nav) to grid-cols-5", () => {
    expect(gridColsClass(5)).toBe("grid-cols-5");
  });

  it("maps 6 items (admin's full nav, including Nómina) to grid-cols-6", () => {
    expect(gridColsClass(6)).toBe("grid-cols-6");
  });

  it("falls back to grid-cols-5 for an unmapped item count", () => {
    expect(gridColsClass(3)).toBe("grid-cols-5");
  });
});

describe("DashboardBottomNav", () => {
  it("renders every default NAV_ITEMS link when no items prop is passed (backward-compatible), 6 items total (admin's list, including Nómina)", () => {
    render(<DashboardBottomNav />);

    expect(NAV_ITEMS.length).toBe(6);
    for (const label of ["Dashboard", "Clientes", "Facturas", "Pagos", "Nómina", "Negocio"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders only the items in a worker-filtered 5-item list (excludes Nómina)", () => {
    const workerItems: NavItem[] = NAV_ITEMS.filter((item) => item.href !== "/nomina");
    expect(workerItems.length).toBe(5);

    render(<DashboardBottomNav items={workerItems} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("renders exactly the number of links passed via items, regardless of count (1-item list)", () => {
    const singleItem: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

    render(<DashboardBottomNav items={singleItem} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
