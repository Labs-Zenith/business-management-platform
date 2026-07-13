import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Responsive nav mutual-exclusivity (`dashboard-sidebar.tsx` vs.
 * `mobile-nav-sheet.tsx`, Fase 4 Lane C) — the one contract unit tests
 * (jsdom, no real CSS layout/media queries) cannot verify: which of the two
 * nav surfaces is actually VISIBLE at a given real viewport width, driven
 * by `dashboard-sidebar.tsx`'s `hidden ... md:flex` and
 * `mobile-nav-sheet.tsx`'s trigger's `md:hidden` Tailwind breakpoint split.
 * Both surfaces' nav links always exist in the DOM (`dashboard-sidebar.tsx`
 * renders unconditionally, `mobile-nav-sheet.tsx`'s drawer content is
 * present once opened) — only CSS visibility differs per breakpoint, so
 * assertions here deliberately check visibility/absence, never pixel
 * widths.
 */
test.describe("Responsive navigation", () => {
  test("mobile viewport: hamburger opens the drawer, desktop sidebar stays hidden, and a link navigates + closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    const hamburger = page.getByRole("button", { name: /abrir menú/i });
    await expect(hamburger).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();

    await hamburger.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    const clientesLink = drawer.getByRole("link", { name: "Clientes" });
    await expect(clientesLink).toBeVisible();

    await clientesLink.click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(drawer).toBeHidden();
  });

  test("desktop viewport: sidebar is visible with nav links, hamburger is hidden, and the collapse toggle persists across reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Clientes" })).toBeVisible();
    await expect(page.getByRole("button", { name: /abrir menú/i })).toBeHidden();

    // Expanded by default: the label is visible text, not just an icon.
    await expect(sidebar.getByText("Dashboard", { exact: true })).toBeVisible();

    const collapseToggle = page.getByRole("button", { name: /colapsar barra lateral/i });
    await collapseToggle.click();

    // Collapsed: the label text is gone, but the link (icon-only) remains.
    await expect(sidebar.getByText("Dashboard", { exact: true })).toBeHidden();
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
    const expandToggle = page.getByRole("button", { name: /expandir barra lateral/i });
    await expect(expandToggle).toBeVisible();

    // Cookie persistence: a reload must restore the collapsed state
    // server-side (`app/(dashboard)/layout.tsx` reads the
    // `sidebar_collapsed` cookie), not just keep it via client state.
    await page.reload();

    await expect(sidebar.getByText("Dashboard", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: /expandir barra lateral/i })).toBeVisible();
  });
});
