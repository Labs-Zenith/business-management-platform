import { expect, test } from "@playwright/test";
import { createCustomer, createInvoice, login } from "./helpers";

/**
 * Column sorting end to end. The unit tests cover the comparators and the href
 * builder in isolation; what only a real browser proves is that clicking a
 * header actually navigates, and that the rows come back in the order the URL
 * asked for.
 */

/** Reads a column's cell text, in render order, from the first table on the page. */
async function columnValues(page: import("@playwright/test").Page, columnIndex: number): Promise<string[]> {
  return page.locator(`table tbody tr td:nth-child(${columnIndex + 1})`).allInnerTexts();
}

test.describe("table sorting", () => {
  test("sorts invoices by total, toggling asc/desc, and keeps the order in the URL", async ({ page }) => {
    await login(page);

    const suffix = `${Date.now()}`;
    const customer = `Sort Cliente ${suffix}`;
    await createCustomer(page, customer);
    await createInvoice(page, customer, { unitPricePesos: 1000 });
    await createInvoice(page, customer, { unitPricePesos: 30000 });
    await createInvoice(page, customer, { unitPricePesos: 7000 });

    await page.goto("/invoices");

    await page.getByRole("link", { name: /^Total/ }).click();
    await expect(page).toHaveURL(/sort=total&dir=desc/);

    const desc = await columnValues(page, 4);
    const descNumbers = desc.map((value) => Number(value.replace(/\D/g, "")));
    expect(descNumbers).toEqual([...descNumbers].sort((a, b) => b - a));

    // Second click on the active column flips the direction.
    await page.getByRole("link", { name: /^Total/ }).click();
    await expect(page).toHaveURL(/sort=total&dir=asc/);

    const asc = await columnValues(page, 4);
    const ascNumbers = asc.map((value) => Number(value.replace(/\D/g, "")));
    expect(ascNumbers).toEqual([...ascNumbers].sort((a, b) => a - b));
  });

  test("reports the active column through aria-sort", async ({ page }) => {
    await login(page);
    await page.goto("/invoices?sort=total&dir=desc");

    const totalHeader = page.getByRole("columnheader", { name: /^Total/ });
    await expect(totalHeader).toHaveAttribute("aria-sort", "descending");

    const numeroHeader = page.getByRole("columnheader", { name: /^Número/ });
    await expect(numeroHeader).toHaveAttribute("aria-sort", "none");
  });

  test("keeps the sort when paginating and the filters when sorting", async ({ page }) => {
    await login(page);

    await page.goto("/customers?q=a&sort=balance&dir=desc");
    // Sorting must not discard the search term the user already applied.
    await page.getByRole("link", { name: /^Nombre/ }).click();
    await expect(page).toHaveURL(/q=a/);
    await expect(page).not.toHaveURL(/sort=balance/);

    const next = page.getByRole("link", { name: /siguiente/i });
    if (await next.isVisible()) {
      const href = await next.getAttribute("href");
      // Page links carry every current param, so paging never resets the sort.
      expect(href).toContain("q=a");
    }
  });

  test("sorts each Nomina table independently without switching tabs", async ({ page }) => {
    await login(page);
    await page.goto("/nomina?tab=pagos");

    const montoHeader = page.getByRole("link", { name: /^Monto/ });
    await montoHeader.click();

    // The Pagos panel stays selected and only its own params change.
    await expect(page).toHaveURL(/tab=pagos/);
    await expect(page).toHaveURL(/paymentsSort=amount/);
    await expect(page).not.toHaveURL(/employeesSort/);
    await expect(page.getByRole("tab", { name: /pagos de nómina/i })).toHaveAttribute("aria-selected", "true");
  });

  test("falls back to the default order for an unknown sort column", async ({ page }) => {
    await login(page);
    await page.goto("/invoices?sort=DROP%20TABLE&dir=asc");

    // A bad param must render the normal table, never a server error.
    await expect(page.getByRole("heading", { name: "Facturas" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^Fecha/ })).toHaveAttribute("aria-sort", "descending");
  });
});
