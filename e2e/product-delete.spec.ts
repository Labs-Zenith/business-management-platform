import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * Deleting a product from Inventario, against the real running server.
 *
 * The delete is GUARDED — a product that has already been invoiced is refused
 * with a `CONFLICT` naming the invoice count, and the dialog then offers
 * "Desactivar" so the refusal is not a dead end. Same rule as customers: a
 * catalog edit never destroys billing history.
 *
 * Deleting is admin-only via the `deleteRecords` capability; the demo account
 * is `admin` in "Negocio Demo" and `worker` in "Negocio Demo 2", so the last
 * test proves the worker never even sees the button.
 */

const INVENTARIO_URL = /\/inventario$/;

async function gotoInventario(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Inventario" }).first().click();
  await expect(page).toHaveURL(INVENTARIO_URL);
}

/**
 * Creates a product with an optional opening quantity. The "Cantidad" field
 * is not part of the product schema — the form reconciles it into an `in`
 * movement after saving (see `product-form-dialog-content.tsx`).
 */
async function createProduct(page: Page, name: string, quantity = 0): Promise<void> {
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Costo unitario").fill("10000");
  if (quantity > 0) {
    await page.getByLabel("Cantidad").fill(String(quantity));
  }
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

test.describe("Eliminar producto (admin-only, blocked once invoiced)", () => {
  test("an admin deletes an unsold product and the row disappears", async ({ page }) => {
    const productName = `Producto Borrable ${Date.now()}`;

    await login(page);
    await gotoInventario(page);
    await createProduct(page, productName);

    const row = page.getByRole("row", { name: new RegExp(productName) });
    await row.getByRole("button", { name: `Eliminar ${productName}` }).click();

    // The confirmation is mandatory — nothing is deleted until it is accepted.
    await expect(page.getByText("¿Eliminar este producto?")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();

    // Wait for the dialog to CLOSE before asserting the row is gone. While a
    // base-ui modal is open the background is inert and drops out of the
    // accessibility tree, so a bare row-count assertion would pass even if the
    // delete had failed — a false green this suite hit for real.
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row).toHaveCount(0);
  });

  test("cancelling the confirmation leaves the product untouched", async ({ page }) => {
    const productName = `Producto Conservado ${Date.now()}`;

    await login(page);
    await gotoInventario(page);
    await createProduct(page, productName);

    const row = page.getByRole("row", { name: new RegExp(productName) });
    await row.getByRole("button", { name: `Eliminar ${productName}` }).click();
    await expect(page.getByText("¿Eliminar este producto?")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    await expect(row).toBeVisible();
  });

  test("a sold product is refused, and the dialog offers Desactivar instead", async ({ page }) => {
    const runId = Date.now();
    const productName = `Producto Vendido ${runId}`;
    const customerName = `Cliente Factura ${runId}`;
    const unitPricePesos = 15000;

    await login(page);

    // A customer to invoice.
    await page.getByRole("link", { name: "Clientes" }).first().click();
    await expect(page).toHaveURL(/\/customers$/);
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await page.getByLabel("Nombre").fill(customerName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // A product with stock, then an invoice that sells one unit of it.
    await gotoInventario(page);
    await createProduct(page, productName, 5);

    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: new RegExp(`^${productName} · stock 5$`) }).click();
    await page.getByLabel("Cantidad").fill("1");
    await page.getByLabel("Valor unitario (COP)").fill(String(unitPricePesos));
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
    const invoiceUrl = page.url();

    // Attempting to delete it is refused.
    await gotoInventario(page);
    const row = page.getByRole("row", { name: new RegExp(productName) });
    await row.getByRole("button", { name: `Eliminar ${productName}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("No se puede eliminar este producto");
    await expect(alert).toContainText("1 factura asociada");
    await expect(alert).toContainText("Desactívalo en su lugar.");

    // Deactivating is offered right there and takes one click.
    await page.getByRole("dialog").getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row).toBeVisible();
    await expect(row.getByText("Inactivo")).toBeVisible();

    // The invoice was never touched.
    await page.goto(invoiceUrl);
    await expect(page.getByText(productName).first()).toBeVisible();
    await expect(page.getByText("$ 15.000").first()).toBeVisible();
  });

  test("a worker never sees the delete button", async ({ page }) => {
    await login(page);
    await gotoInventario(page);

    // Sanity check on whatever rows the page happens to show: the buttons ARE
    // there for the admin, so their absence below is about the role and not
    // about the table failing to render. Deliberately NOT tied to a specific
    // product — the mock store is process-wide, so a freshly created one may
    // sort onto a later page as the suite accumulates products.
    const deleteButtons = page.getByRole("button", { name: /^Eliminar / });
    expect(await deleteButtons.count()).toBeGreaterThan(0);

    // The demo account is `worker` in "Negocio Demo 2". Switching is an
    // inline expanded panel of plain buttons and a HARD navigation that
    // always lands on /dashboard — same gesture as `business-switcher.spec.ts`.
    await page.getByRole("button", { name: "Negocio Demo" }).first().click();
    await page.getByRole("button", { name: "Negocio Demo 2" }).click();
    await page.waitForURL("**/dashboard");

    await gotoInventario(page);
    await expect(page.getByRole("button", { name: /^Eliminar / })).toHaveCount(0);
    // Creating is still allowed — only deleting is gated.
    await expect(page.getByRole("button", { name: "Nuevo producto" })).toBeVisible();
  });
});
