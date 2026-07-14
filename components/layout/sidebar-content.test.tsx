import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SidebarContent from "./sidebar-content";
import { navItemsForRole } from "./nav-items";

const CURRENT_BUSINESS_ID = "biz-1";
const MEMBERSHIPS: BusinessMembership[] = [
  { businessId: CURRENT_BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
];
const EMAIL = "demo@negociodemo.test";

/**
 * Fase 5.1 Lane B: the shared composition rendered IDENTICALLY by
 * `dashboard-sidebar.tsx` (desktop) and `mobile-nav-sheet.tsx` (mobile
 * drawer) — business switcher on top, role-filtered nav in the middle, the
 * bottom user row (`SidebarUserMenu`) pinned via `mt-auto`.
 */
describe("SidebarContent", () => {
  it("renders the business switcher, every navItemsForRole('admin') link, and the bottom user row for an admin role", () => {
    render(
      <SidebarContent
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    expect(screen.getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
    for (const item of navItemsForRole("admin")) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(screen.getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
  });

  it("hides the Nómina nav item for a worker role (matches navItemsForRole filtering), keeping every capability-less item", () => {
    render(
      <SidebarContent
        role="worker"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configuración" })).toBeInTheDocument();
  });

  it("only renders the collapse toggle when showCollapseToggle + onToggleCollapse are both provided", () => {
    const { rerender } = render(
      <SidebarContent
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    expect(screen.queryByRole("button", { name: /colapsar barra lateral/i })).not.toBeInTheDocument();

    rerender(
      <SidebarContent
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        showCollapseToggle
        onToggleCollapse={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });

  it("calls onNavigate when a nav link is clicked (mobile drawer close)", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <SidebarContent
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole("link", { name: "Dashboard" }));

    expect(onNavigate).toHaveBeenCalled();
  });
});
