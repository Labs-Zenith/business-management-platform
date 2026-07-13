import { test, expect } from "@playwright/test";
import { login, createCustomer, createInvoice, formatCOP } from "./helpers";

/**
 * Fase 3 item 3 — invoice editing is unlocked while an invoice still has an
 * outstanding balance (partially paid is editable), per
 * `openspec/changes/invoice-edit-partial/specs/invoices/spec.md`'s "Invoice
 * Editing Locked to Fully-Paid Invoices" and
 * `components/domain/invoices/invoice-form-content.tsx`'s below-paid-total
 * UX warning. Covers, against the real running dev server:
 *
 * - "Editar factura" is visible on a partially-paid invoice.
 * - Editing the total BELOW the amount already paid shows the inline
 *   warning and disables submit.
 * - Raising the total back to a valid value (>= paid amount) re-enables
 *   submit and the save succeeds.
 * - Once the invoice is fully paid, "Editar factura" disappears.
 */
test.describe("Invoice edit unlocked while partially paid (Fase 3 item 3)", () => {
  test("editable while balance > 0, rejects total below paid, locks once fully paid", async ({ page }) => {
    const runId = Date.now();
    const customerName = `Cliente Edicion E2E ${runId}`;

    await login(page);
    await createCustomer(page, customerName);

    const { id: invoiceId } = await createInvoice(page, customerName, { unitPricePesos: 100000 });
    // Total: 1 x $100.000 -> 10,000,000 cents.

    // Register a partial payment of $40.000 (paid amount: 4,000,000 cents).
    const paidPesos = 40000;
    const paidCents = paidPesos * 100;
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByLabel("Monto").fill(String(paidPesos));
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Parcialmente pagada", { exact: true })).toBeVisible();

    // "Editar factura" is visible while balance > 0 (partially paid). It is
    // rendered `role="button"` (not "link"), matching every other action
    // in this app composed via `<Button nativeButton={false} render={<Link
    // .../>} />` — Base UI's `Button` primitive always overrides the
    // rendered element's role to "button" for accessibility purposes
    // (`app/(dashboard)/invoices/[id]/page.tsx`'s "Descargar PDF" is the
    // same pattern), regardless of the underlying `<a>` tag.
    const editLink = page.getByRole("button", { name: "Editar factura" });
    await expect(editLink).toBeVisible();

    // Open the edit form and reduce the total BELOW the paid amount.
    await editLink.click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}/edit$`));
    await page.getByLabel("Valor unitario (COP)").fill("1"); // new total: 100 cents, well below paid

    await expect(
      page.getByText(`El total no puede ser menor a lo ya pagado (${formatCOP(paidCents)}).`)
    ).toBeVisible();
    const saveButton = page.getByRole("button", { name: "Guardar cambios" });
    await expect(saveButton).toBeDisabled();

    // Set a VALID total (>= paid amount) and save.
    const newUnitPricePesos = 200000; // new total: 20,000,000 cents (>= 4,000,000 paid)
    await page.getByLabel("Valor unitario (COP)").fill(String(newUnitPricePesos));
    await expect(
      page.getByText(`El total no puede ser menor a lo ya pagado (${formatCOP(paidCents)}).`)
    ).toHaveCount(0);
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}$`));

    // Register the remaining balance to fully pay the (now larger) invoice.
    const remainingPesos = newUnitPricePesos - paidPesos; // $160.000
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByLabel("Monto").fill(String(remainingPesos));
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Pagada", { exact: true })).toBeVisible();

    // Fully paid now -> "Editar factura" is GONE.
    await expect(page.getByRole("button", { name: "Editar factura" })).toHaveCount(0);
  });
});
