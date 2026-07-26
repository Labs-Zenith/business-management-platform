import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import MobileNavSheet from "./mobile-nav-sheet";
import type { NavItemId } from "./nav-items";

const CURRENT_BUSINESS_ID = "biz-1";
const MEMBERSHIPS: BusinessMembership[] = [
  { businessId: CURRENT_BUSINESS_ID, businessName: "Negocio Demo", role: "admin" },
];
const EMAIL = "demo@negociodemo.test";

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
 * Vercel-style mobile nav drawer that REPLACES `dashboard-bottom-nav.tsx`
 * (Fase 4 Lane C): a hamburger button (mobile-only) opens the SAME
 * `sidebar-content.tsx` composition `dashboard-sidebar.tsx` shows on
 * desktop, as a left `Sheet` (Fase 5.1 Lane B). The gating decision
 * (`resolveVisibleNavIds`) is made entirely server-side in
 * `app/(dashboard)/layout.tsx`; this component just renders whichever
 * `visibleNavIds` it's given, mirroring `dashboard-sidebar.test.tsx`'s
 * assertions, plus the drawer open/close behavior specific to this
 * component.
 */
describe("MobileNavSheet", () => {
  it("is closed by default and opens a nav drawer with every item in visibleNavIds when the hamburger button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavSheet
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
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
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
      />
    );

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
    expect(within(dialog).getByText(EMAIL)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
  });

  it("hides the Nómina link inside the drawer when visibleNavIds excludes it (server already filtered a worker session), keeping Inventario", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavSheet
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={WORKER_VISIBLE_NAV_IDS}
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
        currentBusinessId={CURRENT_BUSINESS_ID}
        memberships={MEMBERSHIPS}
        email={EMAIL}
        visibleNavIds={ADMIN_VISIBLE_NAV_IDS}
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
