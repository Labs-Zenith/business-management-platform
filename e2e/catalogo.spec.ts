import { expect, test } from "@playwright/test";
import { formatCOP, login } from "./helpers";

/**
 * Catálogo — the commercial price book, distinct from Inventario.
 *
 * Runs against the mock store, whose demo business has the `catalog` feature
 * enabled and three seeded products (see `lib/mock/fixtures/catalog-products.ts`),
 * one per non-trivial pricing mode. That seeding is what makes the nav item
 * visible at all: `resolveVisibleNavIds` hides `/catalogo` for a business
 * without the entitlement.
 */

test.describe("Catálogo", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("is reachable from the nav and lists the seeded catalog", async ({ page }) => {
    // `.first()` disambiguates the desktop sidebar vs. mobile nav duplicate —
    // both always render, only CSS visibility differs (see `helpers.ts`).
    await page.getByRole("link", { name: "Catálogo" }).first().click();

    await expect(page).toHaveURL(/\/catalogo$/);
    await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();

    await expect(page.getByRole("link", { name: "Aviso en acrílico" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Stickers troquelados" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Agendas personalizadas" })).toBeVisible();
  });

  test("filters by name", async ({ page }) => {
    await page.goto("/catalogo");

    await page.getByLabel("Buscar").fill("Stickers");
    await page.getByRole("button", { name: "Filtrar" }).click();

    await expect(page.getByRole("link", { name: "Stickers troquelados" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Aviso en acrílico" })).toBeHidden();
  });

  test("shows a package product's closed-package pricing on its detail page", async ({ page }) => {
    await page.goto("/catalogo");
    await page.getByRole("link", { name: "Stickers troquelados" }).click();

    await expect(page).toHaveURL(/\/catalogo\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Stickers troquelados" })).toBeVisible();

    // A package product's minimum is structural — you buy whole packages —
    // so the detail page must surface the package size, not a bare "1".
    await expect(page.getByText("Pedido mínimo")).toBeVisible();
    await expect(page.getByText("3x3 cm")).toBeVisible();
  });

  test("creates a fixed-price product end to end", async ({ page }) => {
    const name = `Servicio de diseño ${Date.now()}`;
    const unitPricePesos = 250000;

    await page.goto("/catalogo/new");

    await page.getByLabel("Nombre").fill(name);
    // `fixed` is the form's default mode, so no Select interaction is needed
    // here — the mode-switching path gets its own coverage below.
    await page.getByLabel("Precio unitario").fill(String(unitPricePesos));

    await page.getByRole("button", { name: "Crear producto" }).click();

    await expect(page).toHaveURL(/\/catalogo\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(formatCOP(unitPricePesos * 100)).first()).toBeVisible();
  });

  test("refuses a tiered product whose variant has no price tiers", async ({ page }) => {
    await page.goto("/catalogo/new");

    await page.getByLabel("Nombre").fill(`Sin escalones ${Date.now()}`);

    // The pricing-mode control is a Base UI `Select` (a labelable
    // `role="combobox"` button), not a native `<select>` — its popup only
    // mounts once opened, so the option must be clicked after the trigger.
    await page.getByLabel("Modo de precio").click();
    await page.getByRole("option", { name: "Escalonado" }).click();

    // A tiered variant with an empty ladder has no price at all. Postgres
    // cannot express that invariant (a CHECK may not reference a child
    // table), so the form and the service are the only things standing
    // between the user and an unpriceable catalog entry. The form refuses at
    // the earliest point it can: submit stays disabled rather than letting the
    // request go out and bounce back as a 400.
    await expect(page.getByRole("button", { name: "Crear producto" })).toBeDisabled();
    await expect(page).not.toHaveURL(/\/catalogo\/[0-9a-f-]+$/);
  });
});
