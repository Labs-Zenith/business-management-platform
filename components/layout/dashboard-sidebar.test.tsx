import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import DashboardSidebar from "./dashboard-sidebar";
import { NAV_ITEMS_BY_ID, SIDEBAR_COLLAPSED_COOKIE, type NavItemId } from "./nav-items";

const CURRENT_BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const EMAIL = "demo@negociodemo.test";

const SINGLE_MEMBERSHIP: BusinessMembership[] = [
  { businessId: CURRENT_BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
];

const MULTIPLE_MEMBERSHIPS: BusinessMembership[] = [
  ...SINGLE_MEMBERSHIP,
  { businessId: "biz-2", businessName: "Negocio Demo 2", role: "admin" },
];

const ADMIN_VISIBLE_NAV_IDS: NavItemId[] = [
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
 * `visibleNavIds` (a plain `NavItemId[]`, per the "Server Component can't
 * pass a `NavItem[]` — it carries `lucide-react` icon component references —
 * across the client boundary" fix): the ENTIRE gating decision
 * (`resolveVisibleNavIds`) now happens server-side in
 * `app/(dashboard)/layout.tsx`, so this component (and the
 * `sidebar-content.tsx` it delegates to) just renders whichever ids it's
 * given, resolving each id's icon/label via `NAV_ITEMS_BY_ID`.
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
  it("renders every item in visibleNavIds for an admin session", () => {
    render(
      <DashboardSidebar
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
      />
    );

    for (const id of ADMIN_VISIBLE_NAV_IDS) {
      const item = NAV_ITEMS_BY_ID[id];
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
  });

  it("renders the worker-filtered list (excludes Nómina, which the server already dropped from visibleNavIds)", () => {
    render(
      <DashboardSidebar
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={WORKER_VISIBLE_NAV_IDS}
      />
    );

    for (const id of WORKER_VISIBLE_NAV_IDS) {
      const item = NAV_ITEMS_BY_ID[id];
      expect(screen.getByRole("link", { name: item.label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("renders the BusinessSwitcher at the top with the current business name visible when not collapsed", () => {
    render(
      <DashboardSidebar
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MULTIPLE_MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
  });

  it("renders the user row at the bottom (avatar + email, plus an Opciones de cuenta trigger)", () => {
    render(
      <DashboardSidebar
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
  });

  it("expands by default (labels visible, toggle offers to collapse) when defaultCollapsed is not passed", () => {
    render(
      <DashboardSidebar
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
      />
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Negocio Demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });

  it("starts collapsed (labels hidden, each link exposes its label via title, business name hidden) when defaultCollapsed is true", () => {
    render(
      <DashboardSidebar
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
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
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
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
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={SINGLE_MEMBERSHIP}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
        defaultCollapsed
      />
    );

    await user.click(screen.getByRole("button", { name: /expandir barra lateral/i }));

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(document.cookie).toContain(`${SIDEBAR_COLLAPSED_COOKIE}=false`);
    expect(screen.getByRole("button", { name: /colapsar barra lateral/i })).toBeInTheDocument();
  });
});
