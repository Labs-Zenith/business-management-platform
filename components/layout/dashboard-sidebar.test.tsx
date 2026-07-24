import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import DashboardSidebar from "./dashboard-sidebar";
import { navItemsForRole, SIDEBAR_COLLAPSED_COOKIE } from "./nav-items";

const CURRENT_BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const EMAIL = "demo@negociodemo.test";

const SINGLE_MEMBERSHIP: BusinessMembership[] = [
  { businessId: CURRENT_BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
];

const MULTIPLE_MEMBERSHIPS: BusinessMembership[] = [
  ...SINGLE_MEMBERSHIP,
  { businessId: "biz-2", businessName: "Negocio Demo 2", role: "admin" },
];

/**
 * `role` prop (a plain string, per the "Server Component can't pass a
 * `NavItem[]` — it carries `lucide-react` icon component references —
 * across the client boundary" fix): `DashboardSidebar` delegates to
 * `sidebar-content.tsx`, which filters `NAV_ITEMS` internally via
 * `navItemsForRole`, so `app/(dashboard)/layout.tsx` only ever needs to
 * pass `session.role`.
 *
 * Fase 5.1 Lane B: this component now ONLY owns the `<aside>` shell +
 * collapse state/cookie — the switcher, nav list, and bottom user row are
 * all rendered by the shared `sidebar-content.tsx` (also used by
 * `mobile-nav-sheet.tsx`'s drawer), which is why this needs an `email` prop
 * now too (for its bottom `SidebarUserMenu`).
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
  // Nav item labels are derived from the live `navItemsForRole` (single
  // source of truth in `nav-items.ts`, owned by another concurrent lane)
  // rather than hardcoded here, so this test doesn't drift when that list
  // changes (e.g. items added/removed/renamed).
  it("renders every navItemsForRole('admin') link for an admin role", () => {
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
      />
    );

    // Feature-gated items (e.g. "Ventas") are excluded — the rendered
    // `navItemsFor(role, businessId)` also filters by the per-business
    // pipeline feature flag, which is disabled by default in tests (no
    // `PIPELINE_ENABLED_BUSINESS_IDS`); that gating has its own dedicated
    // tests (`sidebar-content.test.tsx`).
    for (const item of navItemsForRole("admin").filter((navItem) => !navItem.feature)) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
  });

  it("renders the worker-filtered list (excludes any capability-gated item an admin sees but a worker doesn't)", () => {
    render(
      <DashboardSidebar
        role="worker"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
      />
    );

    const workerItems = navItemsForRole("worker").filter((item) => !item.feature);
    const adminOnlyItems = navItemsForRole("admin").filter(
      (item) => !item.feature && !workerItems.some((workerItem) => workerItem.href === item.href)
    );

    for (const item of workerItems) {
      expect(screen.getByRole("link", { name: item.label })).toBeInTheDocument();
    }
    for (const item of adminOnlyItems) {
      expect(screen.queryByRole("link", { name: item.label })).not.toBeInTheDocument();
    }
  });

  it("renders the BusinessSwitcher at the top with the current business name visible when not collapsed", () => {
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MULTIPLE_MEMBERSHIPS}
        email={EMAIL}
      />
    );

    expect(screen.getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
  });

  it("renders the user row at the bottom (avatar + email, plus an Opciones de cuenta trigger)", () => {
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
      />
    );

    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
  });

  it("expands by default (labels visible, toggle offers to collapse) when defaultCollapsed is not passed", () => {
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
      />
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Negocio Demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });

  it("starts collapsed (labels hidden, each link exposes its label via title, business name hidden) when defaultCollapsed is true", () => {
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        defaultCollapsed
      />
    );

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Negocio Demo")).not.toBeInTheDocument();
    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink).toHaveAttribute("title", "Dashboard");
    expect(screen.getByRole("button", { name: /expandir barra lateral/i })).toBeInTheDocument();
  });

  it("toggles from expanded to collapsed on click, hiding labels and persisting the choice in the sidebar_collapsed cookie", async () => {
    const user = userEvent.setup();
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=; max-age=0`;
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
      />
    );

    await user.click(screen.getByRole("button", { name: /colapsar barra lateral/i }));

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("title", "Dashboard");
    expect(document.cookie).toContain(`${SIDEBAR_COLLAPSED_COOKIE}=true`);
    expect(screen.getByRole("button", { name: /expandir barra lateral/i })).toBeInTheDocument();
  });

  it("toggles from collapsed back to expanded on click, restoring labels and updating the cookie", async () => {
    const user = userEvent.setup();
    render(
      <DashboardSidebar
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        defaultCollapsed
      />
    );

    await user.click(screen.getByRole("button", { name: /expandir barra lateral/i }));

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(document.cookie).toContain(`${SIDEBAR_COLLAPSED_COOKIE}=false`);
    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });
});
