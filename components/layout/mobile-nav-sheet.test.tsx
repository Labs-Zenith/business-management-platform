import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import MobileNavSheet from "./mobile-nav-sheet";

/**
 * Vercel-style mobile nav drawer that REPLACES `dashboard-bottom-nav.tsx`
 * (Fase 4 Lane C): a hamburger button (mobile-only) opens the SAME
 * `navItemsForRole(role)` list `dashboard-sidebar.tsx` shows, as a left
 * `Sheet`. Mirrors `dashboard-sidebar.test.tsx`'s role-filtering
 * assertions, plus the drawer open/close behavior specific to this
 * component.
 */
describe("MobileNavSheet", () => {
  it("is closed by default and opens a nav drawer with every NAV_ITEMS link for an admin role when the hamburger button is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNavSheet role="admin" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    for (const label of ["Dashboard", "Clientes", "Facturas", "Pagos", "Nómina", "Inventario", "Negocio"]) {
      expect(within(dialog).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("hides the Nómina link for a worker role inside the drawer (matches navItemsForRole filtering), keeping Inventario", async () => {
    const user = userEvent.setup();
    render(<MobileNavSheet role="worker" />);

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Nómina" })).not.toBeInTheDocument();
  });

  it("closes the drawer after clicking a nav link", async () => {
    const user = userEvent.setup();
    render(<MobileNavSheet role="admin" />);

    await user.click(screen.getByRole("button", { name: /abrir menú/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("link", { name: "Clientes" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
