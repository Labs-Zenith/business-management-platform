import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DashboardExportMenu } from "./dashboard-export-menu";

/**
 * Mirrors `components/layout/business-switcher.test.tsx`'s "click the
 * trigger, then assert on the opened dropdown's `menuitem`s" pattern — the
 * only other trigger-opens-dropdown component in the codebase.
 */
describe("DashboardExportMenu", () => {
  it("renders a single Exportar trigger (no separate Excel/PDF buttons)", () => {
    render(<DashboardExportMenu />);

    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
  });

  it("opens a dropdown offering Excel and PDF, each linking to the dashboard export route", async () => {
    const user = userEvent.setup();
    render(<DashboardExportMenu />);

    await user.click(screen.getByRole("button", { name: /exportar/i }));

    expect(await screen.findByRole("menuitem", { name: "Excel" })).toHaveAttribute(
      "href",
      "/api/dashboard/export?format=xlsx",
    );
    expect(screen.getByRole("menuitem", { name: "PDF" })).toHaveAttribute(
      "href",
      "/api/dashboard/export?format=pdf",
    );
  });
});
