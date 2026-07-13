import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Egresos (expense tracking) domain — login -> dashboard -> Egresos tab ->
 * "Crear gasto" -> fill the expense form (category, amount via the money
 * input, date) -> save -> assert the new expense appears in the Egresos
 * tab's "Gastos recientes" table (`components/domain/dashboard/recent-expenses.tsx`).
 *
 * The cookie-backed mock store seeds NO expenses for a fresh session
 * (`lib/mock/fixtures/index.ts`'s `seedMinimal`, used by the real
 * cookie-persistence path) — same reason `smoke.spec.ts` always creates a
 * customer before an invoice — so a freshly-created expense is
 * unambiguously the only row once created.
 */
test.describe("Expenses (Egresos)", () => {
  test("create gasto -> appears in Egresos recent expenses", async ({ page }) => {
    const runId = Date.now();
    const description = `Gasto E2E ${runId}`;

    await login(page);

    await page.getByRole("tab", { name: "Egresos" }).click();
    await page.getByRole("button", { name: "Crear gasto" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.getByLabel("Categoria").selectOption({ label: "Otro" });
    await page.getByLabel("Descripcion").fill(description);
    await page.getByLabel("Monto").fill("50000"); // $50.000

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog).toBeHidden();

    const expenseRow = page.getByRole("row", { name: new RegExp(description) });
    await expect(expenseRow).toBeVisible();
    await expect(expenseRow).toContainText("$"); // formatted amount cell is present
  });
});
