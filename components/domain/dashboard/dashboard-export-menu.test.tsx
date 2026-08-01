import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DashboardExportMenu } from "./dashboard-export-menu";

/**
 * `DashboardExportMenu` is now a thin wrapper over the shared `ExportMenu` —
 * the month is chosen by `PeriodMenu` in the header, and this menu just
 * exports whatever `period` key is currently on screen. See
 * `components/domain/export-menu.test.tsx` for the shared component's own
 * coverage; this file only guards the wrapper's own contract: the `period`
 * prop reaches both export hrefs, and the trigger keeps its hydration-safe
 * `data-slot`.
 */
describe("DashboardExportMenu", () => {
  it("renders a single Exportar trigger (no separate Excel/PDF buttons)", () => {
    render(<DashboardExportMenu period="2026-07" />);

    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();
  });

  it("carries the explicit data-slot that keeps the trigger from hydration-mismatching", () => {
    render(<DashboardExportMenu period="2026-07" />);

    // Regression guard for a real bug: base-ui merges `render.props` last while
    // `Button` spreads incoming props last, so whichever supplies `data-slot`
    // depends on WHEN the `<Button>` element is evaluated — RSC serialization
    // vs. client render — and the two disagreed. Writing the value literally at
    // the call site (inside the shared `ExportMenu`) makes both paths converge.
    expect(screen.getByRole("button", { name: /exportar/i })).toHaveAttribute(
      "data-slot",
      "dropdown-menu-trigger",
    );
  });

  it("links Excel and PDF to the export route with the given period", async () => {
    const user = userEvent.setup();
    render(<DashboardExportMenu period="2026-07" />);

    await user.click(screen.getByRole("button", { name: /exportar/i }));

    expect(await screen.findByRole("menuitem", { name: "Excel" })).toHaveAttribute(
      "href",
      "/api/dashboard/export?period=2026-07&format=xlsx",
    );
    expect(screen.getByRole("menuitem", { name: "PDF" })).toHaveAttribute(
      "href",
      "/api/dashboard/export?period=2026-07&format=pdf",
    );
  });
});
