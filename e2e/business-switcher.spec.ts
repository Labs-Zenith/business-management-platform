import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Multi-business switching (`components/layout/business-switcher.tsx`), per
 * Fase 3 item 6 / `roles-multi-business`: `demo@negociodemo.test` is `admin`
 * in "Negocio Demo" and `worker` in "Negocio Demo 2"
 * (`lib/mock/fixtures/data.ts`). Switching POSTs `/api/auth/switch-business`
 * and `router.refresh()`es the current route, so every Server Component
 * re-fetches scoped to the new `businessId` — the nav's "Nomina" item
 * (role-gated, `viewPayroll`) is the clearest visible proof the switch
 * really changed the effective role, not just a display label.
 *
 * Fase 5.1 Lane B: the switcher is now a `Collapsible` at the TOP of the
 * sidebar/drawer chrome (not a topbar `DropdownMenu`) — clicking the
 * trigger expands an INLINE panel listing the other businesses as plain
 * `button`s (not `menuitem`s).
 */
test.describe("Business switcher (sidebar)", () => {
  test("switching businesses changes the active business and the worker role hides Nomina", async ({ page }) => {
    await login(page);

    // Active business starts as "Negocio Demo" (admin) -> Nomina visible.
    // `.first()` disambiguates from any other surface (e.g. the mobile
    // drawer's own switcher, only present once that drawer is opened).
    const switcherTrigger = page.getByRole("button", { name: "Negocio Demo" }).first();
    await expect(switcherTrigger).toBeVisible();
    await expect(page.getByRole("link", { name: "Nómina" }).first()).toBeVisible();

    // Switch to "Negocio Demo 2" (worker) via the inline expanded panel.
    await switcherTrigger.click();
    await page.getByRole("button", { name: "Negocio Demo 2" }).click();

    const switchedTrigger = page.getByRole("button", { name: "Negocio Demo 2" });
    await expect(switchedTrigger).toBeVisible();
    await expect(page.getByRole("link", { name: "Nómina" })).toHaveCount(0);

    // Switch back to "Negocio Demo" (admin) -> Nomina returns.
    await switchedTrigger.click();
    await page.getByRole("button", { name: "Negocio Demo" }).click();

    await expect(page.getByRole("button", { name: "Negocio Demo" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Nómina" }).first()).toBeVisible();
  });
});
