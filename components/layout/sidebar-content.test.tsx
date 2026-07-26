import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SidebarContent from "./sidebar-content";
import { NAV_ITEMS_BY_ID, type NavItemId } from "./nav-items";

const CURRENT_BUSINESS_ID = "biz-1";
const MEMBERSHIPS: BusinessMembership[] = [
  { businessId: CURRENT_BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
];
const EMAIL = "demo@negociodemo.test";

// A representative default id list (no "ventas", the feature-gated item —
// the SERVER decides visibility now; this component runs no gating of its
// own, it just maps ids -> NAV_ITEMS_BY_ID).
const DEFAULT_VISIBLE_NAV_IDS: NavItemId[] = [
  "dashboard",
  "customers",
  "invoices",
  "payments",
  "egresos",
  "nomina",
  "inventario",
  "settings",
];

const WORKER_VISIBLE_NAV_IDS: NavItemId[] = [
  "dashboard",
  "customers",
  "invoices",
  "payments",
  "egresos",
  "inventario",
  "settings",
];

/**
 * Fase 5.1 Lane B: the shared composition rendered IDENTICALLY by
 * `dashboard-sidebar.tsx` (desktop) and `mobile-nav-sheet.tsx` (mobile
 * drawer) — business switcher on top, server-decided nav in the middle, the
 * bottom user row (`SidebarUserMenu`) pinned via `mt-auto`. The gating
 * decision (role capability + per-business feature) is made ENTIRELY on the
 * server (`resolveVisibleNavIds`); this component just renders whichever ids
 * it's given.
 */
describe("SidebarContent", () => {
  it("renders the business switcher, every item in visibleNavIds, and the bottom user row", () => {
    render(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={DEFAULT_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
    for (const id of DEFAULT_VISIBLE_NAV_IDS) {
      const item = NAV_ITEMS_BY_ID[id];
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(screen.getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
  });

  it("hides the Nómina nav item when visibleNavIds excludes it (server already filtered a worker session), keeping every other item", () => {
    render(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={WORKER_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configuración" })).toBeInTheDocument();
  });

  it("only renders the collapse toggle when showCollapseToggle + onToggleCollapse are both provided", () => {
    const { rerender } = render(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={DEFAULT_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.queryByRole("button", { name: /colapsar barra lateral/i })).not.toBeInTheDocument();

    rerender(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={DEFAULT_VISIBLE_NAV_IDS}
        showCollapseToggle
        onToggleCollapse={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });

  it("hides the Ventas nav item when visibleNavIds excludes it (pipeline feature disabled for this business)", () => {
    render(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={DEFAULT_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.queryByRole("link", { name: "Ventas" })).not.toBeInTheDocument();
  });

  it("shows the Ventas nav item once visibleNavIds includes it (pipeline feature enabled for the current business)", () => {
    render(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={[...DEFAULT_VISIBLE_NAV_IDS, "ventas"]}
      />
    );

    expect(screen.getByRole("link", { name: "Ventas" })).toHaveAttribute("href", "/ventas");
  });

  it("calls onNavigate when a nav link is clicked (mobile drawer close)", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <SidebarContent
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={DEFAULT_VISIBLE_NAV_IDS}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole("link", { name: "Dashboard" }));

    expect(onNavigate).toHaveBeenCalled();
  });
});
