import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import MobileNavSheet from "./mobile-nav-sheet";

const CURRENT_BUSINESS_ID = "biz-1";
const MEMBERSHIPS: BusinessMembership[] = [
  { businessId: CURRENT_BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
];
const EMAIL = "demo@negociodemo.test";

/**
 * Vercel-style mobile nav drawer that REPLACES `dashboard-bottom-nav.tsx`
 * (Fase 4 Lane C): a hamburger button (mobile-only) opens the SAME
 * `sidebar-content.tsx` composition `dashboard-sidebar.tsx` shows on
 * desktop, as a left `Sheet` (Fase 5.1 Lane B). Mirrors
 * `dashboard-sidebar.test.tsx`'s role-filtering assertions, plus the
 * drawer open/close behavior specific to this component.
 */
describe("MobileNavSheet", () => {
  it("is closed by default and opens a nav drawer with every NAV_ITEMS link for an admin role when the hamburger button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavSheet
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    for (const label of [
      "Dashboard",
      "Clientes",
      "Facturas",
      "Ingresos",
      "Egresos",
      "Nómina",
      "Inventario",
      "Configuración",
    ]) {
      expect(within(dialog).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("also shows the business switcher and the bottom user row inside the drawer (same chrome as the desktop sidebar)", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavSheet
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
    expect(within(dialog).getByText(EMAIL)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
  });

  it("hides the Nómina link for a worker role inside the drawer (matches navItemsForRole filtering), keeping Inventario", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavSheet
        role="worker"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("closes the drawer after clicking a nav link", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavSheet
        role="admin"
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
      />
    );

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("link", { name: "Clientes" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
