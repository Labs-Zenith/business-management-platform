import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * Voiding an invoice created by mistake, against the real running server.
 *
 * This is the whole point of the feature: the stock it consumed comes back,
 * its payments stop counting, and the customer owes nothing again — without
 * the invoice disappearing from the record.
 */

async function gotoInventario(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Inventario" }).first().click();
  await expect(page).toHaveURL(/\/inventario$/);
}

/** The "Cantidad" column of a product's row in Inventario. */
function quantityCell(page: Page, productName: string) {
  return page.getByRole("row", { name: new RegExp(productName) }).getByRole("cell").nth(3);
}

async function createProduct(page: Page, name: string, quantity: number): Promise<void> {
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Costo unitario").fill("10000");
  await page.getByLabel("Cantidad").fill(String(quantity));
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
}

async function createCustomer(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await expect(page).toHaveURL(/\/customers$/);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test.describe("Anular factura", () => {
  test("returns the stock, clears the money and freezes the invoice", async ({ page }) => {
    const runId = Date.now();
    const productName = `Producto Anular ${runId}`;
    const customerName = `Cliente Anular ${runId}`;

    await login(page);
    await createCustomer(page, customerName);
    await gotoInventario(page);
    await createProduct(page, productName, 8);
    await expect(quantityCell(page, productName)).toHaveText("8");

    // Sell 3 of them, then record a payment.
    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: new RegExp(`^${productName} · stock 8$`) }).click();
    await page.getByLabel("Cantidad").fill("3");
    await page.getByLabel("Valor unitario (COP)").fill("10000");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
    const invoiceUrl = page.url();

    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByLabel("Monto").fill("10000");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("5");

    // Void it, with the mandatory reason.
    await page.goto(invoiceUrl);
    await page.getByRole("button", { name: "Anular factura" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Submit stays disabled until a reason is typed.
    const submit = dialog.getByRole("button", { name: "Anular factura" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Motivo").fill("Se facturó al cliente equivocado");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden();

    // The invoice is now inert: badged, reason shown, actions gone.
    await expect(page.getByText("Anulada").first()).toBeVisible();
    // Twice on purpose: once in the voided notice, once in the audit-log
    // panel (`invoice_voided`) — which is itself the proof it was recorded.
    await expect(page.getByText("Se facturó al cliente equivocado").first()).toBeVisible();
    expect(await page.getByText("Se facturó al cliente equivocado").count()).toBeGreaterThan(1);
    await expect(page.getByRole("button", { name: "Editar factura" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);

    // The stock came back.
    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("8");

    // And the customer owes nothing.
    await page.getByRole("link", { name: "Clientes" }).first().click();
    const row = page.getByRole("row", { name: new RegExp(customerName) });
    await expect(row.getByRole("cell").nth(2)).toHaveText("$ 0");
  });

  test("is hidden from the invoice list unless filtered by Anulada", async ({ page }) => {
    const runId = Date.now();
    const customerName = `Cliente Filtro ${runId}`;

    await login(page);
    await createCustomer(page, customerName);

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

    const number = (await page.getByText(/FAC-\d{4}/).first().textContent())!.trim();

    await page.getByRole("button", { name: "Anular factura" }).click();
    await page.getByLabel("Motivo").fill("Duplicada");
    await page.getByRole("dialog").getByRole("button", { name: "Anular factura" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Gone from the default listing...
    await page.goto("/invoices");
    await expect(page.getByRole("row", { name: new RegExp(number) })).toHaveCount(0);

    // ...but reachable through the status filter.
    await page.goto("/invoices?status=voided");
    await expect(page.getByRole("row", { name: new RegExp(number) })).toBeVisible();
  });

  test("a worker never sees the void action", async ({ page }) => {
    await login(page);
    await page.goto("/invoices");
    await page.getByRole("link", { name: /FAC-/ }).first().click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
    await expect(page.getByRole("button", { name: "Anular factura" })).toBeVisible();

    // The demo account is `worker` in "Negocio Demo 2".
    await page.getByRole("button", { name: "Negocio Demo" }).first().click();
    await page.getByRole("button", { name: "Negocio Demo 2" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/invoices");
    const firstInvoice = page.getByRole("link", { name: /FAC-/ }).first();
    if (await firstInvoice.count()) {
      await firstInvoice.click();
      await expect(page.getByRole("button", { name: "Anular factura" })).toHaveCount(0);
    }
  });
});
