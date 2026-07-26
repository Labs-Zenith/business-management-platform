import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BusinessMembership, Session } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import DashboardTopbar from "./dashboard-topbar";
import type { NavItemId } from "./nav-items";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const WORKER_SESSION: Session = {
  ...SESSION,
  role: "worker",
};

const MEMBERSHIPS: BusinessMembership[] = [
  { businessId: SESSION.businessId, businessName: "Negocio Demo", role: "admin" },
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
 * `DashboardTopbar` renders `MobileNavSheet` (Fase 4 Lane C's hamburger
 * drawer, replacing `dashboard-bottom-nav.tsx`) — this needs
 * `session.businessId`/`session.email`/`memberships`/`visibleNavIds`
 * threaded to it, exercised here the same way `dashboard-sidebar.test.tsx`
 * exercises nav-id filtering (now decided entirely server-side by
 * `resolveVisibleNavIds`, so this component takes the already-filtered id
 * list rather than a `role`). Fase 5.1 Lane B: the topbar no longer renders
 * its own user menu — `session.email`'s only exposure from this component
 * is via `MobileNavSheet`'s drawer (`SidebarUserMenu`, once opened).
 */
describe("DashboardTopbar", () => {
  it("renders the mobile-nav hamburger button", () => {
    render(
      <DashboardTopbar session={SESSION} memberships={MEMBERSHIPS} visibleNavIds={ADMIN_VISIBLE_NAV_IDS} />
    );

    expect(screen.getByRole("button", { name: /abrir menú/i })).toBeInTheDocument();
  });

  it("threads a worker session's visibleNavIds into the hamburger drawer so it excludes Nómina", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <DashboardTopbar
        session={WORKER_SESSION}
        memberships={MEMBERSHIPS}
        visibleNavIds={WORKER_VISIBLE_NAV_IDS}
      />
    );

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(dialog).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("threads memberships + session.email into the drawer, showing the business switcher and the user row with Cerrar sesión once opened", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <DashboardTopbar session={SESSION} memberships={MEMBERSHIPS} visibleNavIds={ADMIN_VISIBLE_NAV_IDS} />
    );

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Opciones de cuenta" }));

    expect(await screen.findByRole("menuitem", { name: /cerrar sesión/i })).toBeInTheDocument();
  });
});
