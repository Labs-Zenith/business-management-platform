import { expect, test } from "@playwright/test";
import { createCustomer, createInvoice, login } from "./helpers";

/**
 * The filter regression this suite exists for: `SelectFilterField` used to
 * submit the PREVIOUSLY selected value, because it called
 * `form.requestSubmit()` synchronously inside base-ui's `onValueChange` —
 * which runs before React commits the new value to the hidden input.
 *
 * A component test can assert the submitted `FormData`, but only a real
 * browser proves the whole chain: pick a value -> the form navigates -> the
 * server receives the right query -> the table narrows.
 */

test.describe("list filters", () => {
  test("applies and then clears the Estado filter on /invoices", async ({ page }) => {
    await login(page);
    await page.goto("/invoices");

    await page.getByLabel("Estado").click();
    await page.getByRole("option", { name: "Pagada", exact: true }).click();

    // Before the fix this navigated to `?status=` — the previous, empty value.
    await expect(page).toHaveURL(/status=paid/);
    await expect(page.getByLabel("Estado")).toHaveText(/Pagada/);

    // Clearing was equally broken: picking "Todos" re-submitted "paid".
    await page.getByLabel("Estado").click();
    await page.getByRole("option", { name: "Todos", exact: true }).click();
    await expect(page).not.toHaveURL(/status=paid/);
    await expect(page.getByLabel("Estado")).toHaveText(/Todos/);
  });

  test("narrows the invoice list to the customer picked in the Cliente filter", async ({ page }) => {
    await login(page);

    const suffix = `${Date.now()}`;
    const mine = `Filtro Cliente ${suffix}`;
    const other = `Filtro Otro ${suffix}`;
    await createCustomer(page, mine);
    await createCustomer(page, other);
    await createInvoice(page, mine, { unitPricePesos: 1234 });
    await createInvoice(page, other, { unitPricePesos: 5678 });

    await page.goto("/invoices");
    await page.getByLabel("Cliente").click();
    await page.getByRole("option", { name: mine, exact: true }).click();

    // A non-empty customerId is the whole point: the old code sent `?customerId=`.
    await expect(page).toHaveURL(/customerId=[0-9a-f-]{36}/);

    const customerCells = await page.locator("table tbody tr td:nth-child(2)").allInnerTexts();
    expect(customerCells.length).toBeGreaterThan(0);
    expect(customerCells.every((cell) => cell.trim() === mine)).toBe(true);
  });

  test("keeps the customer scope on /payments when the date filter is submitted", async ({ page }) => {
    await login(page);

    const suffix = `${Date.now()}`;
    const customer = `Pago Cliente ${suffix}`;
    await createCustomer(page, customer);
    await createInvoice(page, customer, { unitPricePesos: 4000 });

    await page.goto("/customers");
    const customerLink = page.getByRole("link", { name: customer });
    await customerLink.click();
    const customerId = new URL(page.url()).pathname.split("/").pop()!;

    await page.goto(`/payments?customerId=${customerId}`);
    await page.getByRole("button", { name: "Filtrar" }).click();

    // A native GET submit rebuilds the query string from the form's fields
    // alone, so without the hidden passthrough this dropped back to every
    // customer's payments.
    await expect(page).toHaveURL(new RegExp(`customerId=${customerId}`));
  });

  test("applies the Estado filter on /customers, which used to be a bare native select", async ({ page }) => {
    await login(page);
    await page.goto("/customers");

    await page.getByLabel("Estado").click();
    await page.getByRole("option", { name: "Inactivos", exact: true }).click();

    await expect(page).toHaveURL(/status=inactive/);
    await expect(page.getByLabel("Estado")).toHaveText(/Inactivos/);
  });

  test("resets to the first page when a filter is applied", async ({ page }) => {
    await login(page);
    await page.goto("/invoices?page=3");

    await page.getByLabel("Estado").click();
    await page.getByRole("option", { name: "Pendiente", exact: true }).click();

    await expect(page).toHaveURL(/status=pending/);
    // Page 3 of an unfiltered list holds different rows than page 3 of a
    // filtered one, so the page number must not survive.
    await expect(page).not.toHaveURL(/page=3/);
  });
});
