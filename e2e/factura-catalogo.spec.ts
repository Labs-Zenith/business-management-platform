import { expect, test, type Page } from "@playwright/test";
import { createCustomer, formatCOP, login } from "./helpers";

/**
 * Billing a catalog product from an invoice.
 *
 * This is the property the whole catalog module exists for, and the one no
 * unit test can prove end to end: a service picked from the price book is
 * billed exactly like an inventory product — same picker, same line — while
 * moving no stock at all, because a service has none.
 *
 * Runs against the in-memory mock store as the demo user (see
 * `playwright.config.ts`, which blanks every Supabase/Postgres variable for
 * the server it spawns, so the suite cannot reach a real database).
 */

/** Distinct per run AND per call, so no name is a prefix of another under Playwright's strict locators. */
function unique(prefix: string): string {
  return `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Picks an option from a Base UI `Select` — a labelable `role="combobox"` whose popup mounts only once opened. */
async function selectOption(page: Page, label: string | RegExp, optionName: string | RegExp): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: optionName }).click();
}

/** Creates a simple name-and-price catalog product and returns its name. */
async function createCatalogService(page: Page, pricePesos: number): Promise<string> {
  const name = unique("Servicio");
  await page.goto("/catalogo");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  // Scoped to the dialog: it opens on top of the list, whose filter bar has
  // controls with overlapping labels.
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByLabel("Precio", { exact: true }).fill(String(pricePesos));
  await dialog.getByRole("button", { name: "Crear producto" }).click();
  // The dialog closes and the list refreshes in place; no navigation.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("link", { name })).toBeVisible();
  return name;
}

test.describe("Facturar desde el catálogo", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("bills a catalog service, auto-filling its price and moving no stock", async ({ page }) => {
    const pricePesos = 250_000;
    const customer = unique("Cliente Catálogo");

    await createCustomer(page, customer);
    const service = await createCatalogService(page, pricePesos);

    // Snapshot inventory before, so the "no stock moved" claim is measured
    // rather than assumed.
    await page.goto("/inventario");
    const inventoryBefore = await page.locator("table").innerText();

    await page.goto("/invoices/new");
    await selectOption(page, "Cliente", customer);

    // The picker offers both sources under their own headings.
    await page.getByLabel("Producto").first().click();
    await expect(page.getByRole("group").filter({ hasText: "Inventario" }).first()).toBeVisible();
    await expect(page.getByRole("group").filter({ hasText: "Catálogo" }).first()).toBeVisible();
    await page.getByRole("option", { name: new RegExp(service) }).click();

    // Picking a catalog product fills in its price — the thing that makes
    // billing a service one click rather than a lookup.
    await expect(page.getByLabel("Valor unitario (COP)").first()).toHaveValue(
      new RegExp(String(pricePesos).replace(/\B(?=(\d{3})+(?!\d))/g, "[.,]?")),
    );

    await page.getByLabel("Cantidad").first().fill("2");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

    await expect(page.getByText(service).first()).toBeVisible();
    await expect(page.getByText(formatCOP(pricePesos * 2 * 100)).first()).toBeVisible();

    // The point: no inventory movement anywhere.
    await page.goto("/inventario");
    expect(await page.locator("table").innerText()).toBe(inventoryBefore);
  });

  test("bills a service in fractional hours, which an inventory line may not do", async ({ page }) => {
    const customer = unique("Cliente Horas");
    await createCustomer(page, customer);
    const service = await createCatalogService(page, 100_000);

    await page.goto("/invoices/new");
    await selectOption(page, "Cliente", customer);
    await page.getByLabel("Producto").first().click();
    await page.getByRole("option", { name: new RegExp(service) }).click();

    // A catalog line generates no inventory movement, so it is not bound by
    // the INTEGER quantity column that constrains inventory lines.
    await page.getByLabel("Cantidad").first().fill("1.5");
    await page.getByRole("button", { name: "Crear factura" }).click();

    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
    await expect(page.getByText(formatCOP(150_000 * 100)).first()).toBeVisible();
  });
});
