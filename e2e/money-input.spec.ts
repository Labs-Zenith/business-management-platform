import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Fase 3 item 2 — money fields (`components/ui/money-input.tsx`'s
 * `MoneyInput`) are text inputs that: start empty (no internal string
 * state duplicating the raw value — see that file's doc comment), format
 * with `.` thousands separators as the user types (`lib/format/numeric-mask.ts`'s
 * `formatForDisplay`), and can be cleared back to empty.
 *
 * Exercises the invoice item's "Valor unitario (COP)" field on
 * `/invoices/new` (a `MoneyInput`) — no customer/invoice needs to actually
 * be created since this test never submits the form.
 */
test.describe("Money input formatting (Fase 3 item 2)", () => {
  test("starts empty, formats with thousands separators, and can be cleared", async ({ page }) => {
    await login(page);
    await page.goto("/invoices/new");

    const unitPriceInput = page.getByLabel("Valor unitario (COP)");

    // Starts empty.
    await expect(unitPriceInput).toHaveValue("");

    // Typing "1500000" displays a thousands-separated value.
    await unitPriceInput.fill("1500000");
    const displayed = await unitPriceInput.inputValue();
    expect(displayed).toContain("1.500.000");

    // Can be cleared back to empty.
    await unitPriceInput.fill("");
    await expect(unitPriceInput).toHaveValue("");
  });
});
