import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Inventario (stock tracking) domain, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`. The
 * cookie-backed mock store seeds NO products for a fresh session
 * (`lib/mock/fixtures/index.ts`'s `seedMinimal`) — a product must be created
 * first, then "entrada"/"salida" movements recompute its quantity, per
 * `app/(dashboard)/inventario/page.tsx`'s `currentQuantity` column
 * (`lib/services/inventory-service.ts`).
 */
test.describe("Inventario (stock tracking)", () => {
  test("create product -> entrada movement -> salida movement -> quantity reflects N - M", async ({ page }) => {
    const runId = Date.now();
    const productName = `Producto E2E ${runId}`;

    await login(page);

    await page.getByRole("link", { name: "Inventario" }).first().click();
    await expect(page).toHaveURL(/\/inventario$/);

    // Create a product (Productos tab is the default). Starts at quantity 0
    // (no movements yet).
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const productDialog = page.getByRole("dialog");
    await expect(productDialog).toBeVisible();
    await page.getByLabel("Nombre").fill(productName);
    await page.getByLabel("Costo unitario").fill("25000");
    await page.getByLabel("Stock minimo").fill("5");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(productDialog).toBeHidden();

    const productRow = page.getByRole("row", { name: new RegExp(productName) });
    await expect(productRow).toBeVisible();
    await expect(productRow.getByRole("cell").nth(3)).toHaveText("0");

    // Register an "entrada" (in) movement of 10.
    await page.getByRole("tab", { name: "Movimientos" }).click();
    await page.getByRole("button", { name: "Registrar movimiento" }).click();
    const movementDialog = page.getByRole("dialog");
    await expect(movementDialog).toBeVisible();
    // `exact: true` disambiguates from the "Productos" tabpanel, which
    // Playwright's `getByLabel` also matches via its `aria-labelledby`
    // (pointing at the "Productos" tab) since "Producto" is a substring.
    await page.getByLabel("Producto", { exact: true }).selectOption({ label: productName });
    await page.getByLabel("Tipo").selectOption({ label: "Entrada" });
    await page.getByLabel("Cantidad").fill("10");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(movementDialog).toBeHidden();

    await page.getByRole("tab", { name: "Productos" }).click();
    await expect(productRow.getByRole("cell").nth(3)).toHaveText("10");

    // Register a "salida" (out) movement of 4 -> quantity is 10 - 4 = 6.
    await page.getByRole("tab", { name: "Movimientos" }).click();
    await page.getByRole("button", { name: "Registrar movimiento" }).click();
    await expect(movementDialog).toBeVisible();
    await page.getByLabel("Producto", { exact: true }).selectOption({ label: productName });
    await page.getByLabel("Tipo").selectOption({ label: "Salida" });
    await page.getByLabel("Cantidad").fill("4");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(movementDialog).toBeHidden();

    await page.getByRole("tab", { name: "Productos" }).click();
    await expect(productRow.getByRole("cell").nth(3)).toHaveText("6");
  });
});
