import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Fase 3 item 4 — the dashboard header's single "Exportar" dropdown
 * (`components/domain/dashboard/dashboard-export-menu.tsx`) replaces the old
 * separate Excel/PDF buttons. Both menu items are static `<Link>`s to
 * `/api/dashboard/export?format=xlsx|pdf`
 * (`app/api/dashboard/export/route.ts`), which responds with
 * `Content-Disposition: attachment` (`lib/export/http.ts`'s
 * `binaryAttachment`) — clicking either link triggers a genuine browser
 * download rather than a navigation, captured here via Playwright's
 * `download` event.
 */
test.describe("Dashboard export menu (Fase 3 item 4)", () => {
  test("Exportar -> Excel and Exportar -> PDF each trigger a real download", async ({ page }) => {
    await login(page);

    const trigger = page.getByRole("button", { name: "Exportar" });

    await trigger.click();
    const [xlsxDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Excel" }).click(),
    ]);
    expect(xlsxDownload.suggestedFilename()).toMatch(/\.xlsx$/);

    await trigger.click();
    const [pdfDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "PDF" }).click(),
    ]);
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
