import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Session } from "@/lib/services/ports";

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

/**
 * `DashboardTopbar` renders `MobileNavSheet` (Fase 4 Lane C's hamburger
 * drawer, replacing `dashboard-bottom-nav.tsx`) — this needs `session.role`
 * threaded to it, exercised here the same way `dashboard-sidebar.test.tsx`
 * exercises role-based filtering. It also renders `UserMenu` (Fase 5 Lane 1
 * — replaces the previous static avatar + separate `LogoutButton`), whose
 * "Cerrar sesion" action now lives inside a dropdown rather than a directly
 * visible button.
 */
describe("DashboardTopbar", () => {
  it("renders the mobile-nav hamburger button alongside the user menu avatar trigger", () => {
    render(<DashboardTopbar session={SESSION} />);

    expect(screen.getByRole("button", { name: /abrir menú/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SESSION.email })).toBeInTheDocument();
  });

  it("threads session.role into the hamburger drawer so a worker session's drawer excludes Nómina", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<DashboardTopbar session={WORKER_SESSION} />);

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(dialog).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("opens the user menu to reveal the session email and a Cerrar sesion action", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<DashboardTopbar session={SESSION} />);

    await user.click(screen.getByRole("button", { name: SESSION.email }));

    expect(await screen.findByText(SESSION.email)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /cerrar sesion/i })).toBeInTheDocument();
  });
});
