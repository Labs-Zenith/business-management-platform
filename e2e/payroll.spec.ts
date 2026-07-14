import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Nomina (payroll) domain, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`.
 *
 * The cookie-backed mock store seeds NO employees for a fresh session
 * (`lib/mock/fixtures/index.ts`'s `seedMinimal`) — so an employee must be
 * created first before a payroll payment can be registered against it
 * (mirrors `smoke.spec.ts`'s "create a customer before an invoice"
 * precedent).
 *
 * Second test covers Fase 3 item 6 — `demo@negociodemo.test` is `admin` in
 * "Negocio Demo" and `worker` in "Negocio Demo 2"
 * (`lib/mock/fixtures/data.ts`); a `worker` session must not see "Nomina" in
 * the nav (`components/layout/nav-items.ts`'s `navItemsForRole`).
 */
test.describe("Nomina (payroll)", () => {
  test("register a payroll payment for an active employee -> appears in Pagos and as an Egresos expense", async ({
    page,
  }) => {
    const runId = Date.now();
    const employeeName = `Empleado E2E ${runId}`;

    await login(page);

    await page.getByRole("link", { name: "Nómina" }).first().click();
    await expect(page).toHaveURL(/\/nomina$/);

    // Create an active employee (Empleados tab is the default).
    await page.getByRole("button", { name: "Nuevo empleado" }).click();
    const employeeDialog = page.getByRole("dialog");
    await expect(employeeDialog).toBeVisible();
    await page.getByLabel("Nombre").fill(employeeName);
    await page.getByLabel("Salario base").fill("2000000");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(employeeDialog).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(employeeName) })).toBeVisible();

    // Switch to the Pagos de nomina tab and register a payment for it (the
    // employee select defaults to the first/only active employee option).
    await page.getByRole("tab", { name: "Pagos de nomina" }).click();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const paymentDialog = page.getByRole("dialog");
    await expect(paymentDialog).toBeVisible();
    // `exact: true` disambiguates from the "Empleados" tabpanel, which
    // Playwright's `getByLabel` also matches via its `aria-labelledby`
    // (pointing at the "Empleados" tab) since "Empleado" is a substring.
    await page.getByLabel("Empleado", { exact: true }).selectOption({ label: employeeName });
    await page.getByLabel("Monto").fill("1500000"); // $1.500.000
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(paymentDialog).toBeHidden();

    await expect(page.getByRole("row", { name: new RegExp(employeeName) }).last()).toBeVisible();

    // The payroll payment is atomically linked to a `category: 'nomina'`
    // expense (`lib/services/payroll-service.ts`) — confirm it shows up in
    // the dashboard's Egresos tab too.
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("tab", { name: "Egresos" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`Nomina ${employeeName}`) })).toBeVisible();
  });

  test("a worker session (Negocio Demo 2) does not see Nomina in the nav", async ({ page }) => {
    await login(page);

    await expect(page.getByRole("link", { name: "Nómina" }).first()).toBeVisible();

    // Fase 5.1 Lane B: the switcher is a `Collapsible`, not a `DropdownMenu`
    // — the other business is a plain `button` inside the expanded inline
    // panel, not a `menuitem`.
    await page.getByRole("button", { name: "Negocio Demo" }).click();
    await page.getByRole("button", { name: "Negocio Demo 2" }).click();

    await expect(page.getByRole("button", { name: "Negocio Demo 2" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nómina" })).toHaveCount(0);
  });
});
