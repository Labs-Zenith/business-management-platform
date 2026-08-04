import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * Deleting a customer, against the real running server.
 *
 * Unlike products, this delete is GUARDED: `invoices.customer_id` and
 * `payments.customer_id` are NOT NULL and an invoice resolves the customer's
 * name by lookup, so a customer with financial history is refused with a
 * `CONFLICT` rather than orphaning invoices. The refusal message is what the
 * user reads, so it is asserted verbatim-ish here.
 *
 * Admin-only via `deleteRecords`; the demo account is `worker` in
 * "Negocio Demo 2", which the last test uses.
 */

async function gotoClientes(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await expect(page).toHaveURL(/\/customers$/);
}

async function createCustomer(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Crear cliente" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name })).toBeVisible();
}

test.describe("Eliminar cliente (admin-only, blocked once referenced)", () => {
  test("an admin deletes a customer with no invoices and the row disappears", async ({ page }) => {
    const customerName = `Cliente Borrable ${Date.now()}`;

    await login(page);
    await gotoClientes(page);
    await createCustomer(page, customerName);

    const row = page.getByRole("row", { name: new RegExp(customerName) });
    await row.getByRole("button", { name: `Eliminar ${customerName}` }).click();

    await expect(page.getByText("¿Eliminar este cliente?")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();

    // The dialog must CLOSE first: an open base-ui modal makes the background
    // inert, so asserting the row alone would pass even on a failed delete.
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row).toHaveCount(0);
  });

  test("deleting from the detail page navigates back to the list", async ({ page }) => {
    const customerName = `Cliente Detalle ${Date.now()}`;

    await login(page);
    await gotoClientes(page);
    await createCustomer(page, customerName);

    await page.getByRole("link", { name: customerName }).click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: `Eliminar ${customerName}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();

    // Staying on the detail page of a deleted customer would 404 on refresh.
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole("link", { name: customerName })).toHaveCount(0);
  });

  test("a customer with an invoice is refused, naming the count and suggesting deactivation", async ({
    page,
  }) => {
    const runId = Date.now();
    const customerName = `Cliente Con Factura ${runId}`;

    await login(page);
    await gotoClientes(page);
    await createCustomer(page, customerName);

    // A free-text ("Otro") line — this test is about the customer guard, not
    // inventory, so it deliberately avoids touching stock.
    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: "Otro…" }).click();
    await page.getByLabel("Descripción").fill("Servicio suelto");
    await page.getByLabel("Cantidad").fill("1");
    await page.getByLabel("Valor unitario (COP)").fill("50000");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

    await gotoClientes(page);
    const row = page.getByRole("row", { name: new RegExp(customerName) });
    await row.getByRole("button", { name: `Eliminar ${customerName}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();

    // The dialog stays open showing WHY, and the customer survives.
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("No se puede eliminar este cliente");
    await expect(alert).toContainText("1 factura asociada");
    await expect(alert).toContainText("Desactívalo en su lugar.");

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(row).toBeVisible();
  });

  test("a worker never sees the delete button", async ({ page }) => {
    const customerName = `Cliente Worker ${Date.now()}`;

    await login(page);
    await gotoClientes(page);
    await createCustomer(page, customerName);
    await expect(
      page
        .getByRole("row", { name: new RegExp(customerName) })
        .getByRole("button", { name: `Eliminar ${customerName}` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Negocio Demo" }).first().click();
    await page.getByRole("button", { name: "Negocio Demo 2" }).click();
    await page.waitForURL("**/dashboard");

    await gotoClientes(page);
    await expect(page.getByRole("button", { name: /^Eliminar / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crear cliente" })).toBeVisible();
  });
});
