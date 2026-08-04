import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * Invoicing a product decrements its stock, and hitting zero blocks the sale.
 *
 * The decrement itself lives in `lib/db/invoice-repo.ts#create`: an `out`
 * `inventory_movements` row per product line, inserted in the SAME
 * transaction as the invoice, behind a `FOR UPDATE` row lock and a
 * floor-at-zero guard — an over-draw inserts zero rows and rolls the whole
 * invoice back, so no partial invoice is ever persisted. These tests prove
 * that end to end, through the real UI, plus the client-side affordances that
 * stop the user reaching the failure in the first place.
 */

async function gotoInventario(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Inventario" }).first().click();
  await expect(page).toHaveURL(/\/inventario$/);
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

/** The "Cantidad" column of a product's row in Inventario. */
function quantityCell(page: Page, productName: string) {
  return page.getByRole("row", { name: new RegExp(productName) }).getByRole("cell").nth(3);
}

test.describe("Facturar descuenta stock y se bloquea en 0", () => {
  test("selling 2 of 2 drops the stock to 0, and the next sale is refused", async ({ page }) => {
    const runId = Date.now();
    const productName = `Producto Stock ${runId}`;
    const customerName = `Cliente Stock ${runId}`;

    await login(page);
    await createCustomer(page, customerName);
    await gotoInventario(page);
    await createProduct(page, productName, 2);
    await expect(quantityCell(page, productName)).toHaveText("2");

    // Sell both units.
    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: new RegExp(`^${productName} · stock 2$`) }).click();
    await page.getByLabel("Cantidad").fill("2");
    await page.getByLabel("Valor unitario (COP)").fill("20000");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

    // Stock is now 0.
    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("0");

    // At zero the product is offered as "sin stock" and cannot be picked —
    // the user is stopped before filling the rest of the form.
    await page.goto("/invoices/new");
    await page.getByLabel("Producto").click();
    const soldOut = page.getByRole("option", { name: `${productName} · sin stock` });
    await expect(soldOut).toBeVisible();
    await expect(soldOut).toHaveAttribute("data-disabled", /.*/);
  });

  test("a quantity above the available stock is flagged inline before submitting", async ({ page }) => {
    const runId = Date.now();
    const productName = `Producto Aviso ${runId}`;
    const customerName = `Cliente Aviso ${runId}`;

    await login(page);
    await createCustomer(page, customerName);
    await gotoInventario(page);
    await createProduct(page, productName, 3);

    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: new RegExp(`^${productName} · stock 3$`) }).click();

    await page.getByLabel("Cantidad").fill("4");
    await expect(page.getByText("Solo hay 3 en stock")).toBeVisible();

    // Back within the available stock, the warning clears.
    await page.getByLabel("Cantidad").fill("3");
    await expect(page.getByText("Solo hay 3 en stock")).toHaveCount(0);
  });

  test("stock is unchanged when the invoice is rejected — no partial invoice is persisted", async ({
    page,
  }) => {
    const runId = Date.now();
    const productName = `Producto Rollback ${runId}`;
    const customerName = `Cliente Rollback ${runId}`;

    await login(page);
    await createCustomer(page, customerName);
    await gotoInventario(page);
    await createProduct(page, productName, 1);

    // Drive the server guard directly: the client affordance would normally
    // stop this, so the request is issued from the page's own origin to prove
    // the SERVER is the authority, not the form.
    const result = await page.evaluate(async ({ customerName, productName }) => {
      const customers = await (await fetch("/api/customers?page=1&pageSize=50")).json();
      const products = await (await fetch("/api/products?page=1&pageSize=50")).json();
      const customer = customers.data?.find((c: { name: string }) => c.name === customerName);
      const product = products.data?.find((p: { name: string }) => p.name === productName);
      if (!customer || !product) {
        return { status: 0, body: { error: { message: `lookup failed: ${JSON.stringify({ customers, products })}` } } };
      }

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          issueDate: "2026-08-04",
          items: [
            { description: productName, quantity: 5, unitPrice: 10000, productId: product.id },
          ],
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { customerName, productName });

    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("Stock insuficiente");

    // The rollback held: the unit is still on the shelf.
    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("1");
  });
});

/**
 * A credit note is a RETURN: it must ADD the units back. Before this, every
 * invoice type emitted `out` movements, so recording a return subtracted the
 * returned goods a second time.
 */
test.describe("Nota crédito devuelve stock", () => {
  test("selling 2 then returning 2 leaves the stock where it started", async ({ page }) => {
    const runId = Date.now();
    const productName = `Producto Devolucion ${runId}`;
    const customerName = `Cliente Devolucion ${runId}`;

    await login(page);
    await createCustomer(page, customerName);
    await gotoInventario(page);
    await createProduct(page, productName, 6);
    await expect(quantityCell(page, productName)).toHaveText("6");

    // Sale of 2 -> 4 left.
    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: new RegExp(`^${productName} · stock 6$`) }).click();
    await page.getByLabel("Cantidad").fill("2");
    await page.getByLabel("Valor unitario (COP)").fill("40000");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("4");

    // The customer returns both: a credit note for 2 -> back to 6, NOT 2.
    await page.goto("/invoices/new");
    await page.getByLabel("Tipo de factura").click();
    await page.getByRole("option", { name: "Nota crédito" }).click();
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();
    await page.getByLabel("Producto").click();
    await page.getByRole("option", { name: new RegExp(`^${productName} · stock 4$`) }).click();
    await page.getByLabel("Cantidad").fill("2");
    await page.getByLabel("Valor unitario (COP)").fill("40000");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
    // Its own NC sequence, separate from the sale's FAC numbering.
    await expect(page.getByText(/NC-\d{4}/).first()).toBeVisible();

    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("6");
  });

  test("an out-of-stock product can still be returned — the sale-side guard must not block it", async ({
    page,
  }) => {
    const runId = Date.now();
    const productName = `Producto Agotado ${runId}`;
    const customerName = `Cliente Agotado ${runId}`;

    await login(page);
    await createCustomer(page, customerName);
    await gotoInventario(page);
    await createProduct(page, productName, 0);
    await expect(quantityCell(page, productName)).toHaveText("0");

    await page.goto("/invoices/new");
    await page.getByLabel("Tipo de factura").click();
    await page.getByRole("option", { name: "Nota crédito" }).click();
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: customerName }).click();

    // On a credit note the product must be selectable even at zero — it is
    // exactly the product being returned. (On a SALE it would read "sin
    // stock" and be disabled.)
    await page.getByLabel("Producto").click();
    const option = page.getByRole("option", { name: new RegExp(`^${productName} · stock 0$`) });
    await expect(option).toBeVisible();
    await expect(option).not.toHaveAttribute("data-disabled", /.*/);
    await option.click();

    await page.getByLabel("Cantidad").fill("3");
    await page.getByLabel("Valor unitario (COP)").fill("10000");
    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

    await gotoInventario(page);
    await expect(quantityCell(page, productName)).toHaveText("3");
  });
});
