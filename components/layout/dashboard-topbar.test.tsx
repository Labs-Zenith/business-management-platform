import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BusinessMembership, Session } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import DashboardTopbar from "./dashboard-topbar";

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

const SINGLE_MEMBERSHIP: BusinessMembership[] = [
  { businessId: SESSION.businessId, businessName: "Negocio Demo", role: "admin" },
];

/**
 * `DashboardTopbar` now also renders `MobileNavSheet` (Fase 4 Lane C's
 * hamburger drawer, replacing `dashboard-bottom-nav.tsx`) — this needs
 * `session.role` threaded to it, exercised here the same way
 * `dashboard-sidebar.test.tsx` exercises role-based filtering.
 */
describe("DashboardTopbar", () => {
  it("renders the mobile-nav hamburger button alongside the existing session avatar and logout action", () => {
    render(<DashboardTopbar session={SESSION} memberships={SINGLE_MEMBERSHIP} />);

    expect(screen.getByRole("button", { name: /abrir menú/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesion/i })).toBeInTheDocument();
  });

  it("threads session.role into the hamburger drawer so a worker session's drawer excludes Nómina", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<DashboardTopbar session={WORKER_SESSION} memberships={SINGLE_MEMBERSHIP} />);

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(dialog).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });
});
