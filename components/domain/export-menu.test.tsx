import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExportMenu } from "./export-menu";

/**
 * Mirrors `components/layout/business-switcher.test.tsx`'s "click the
 * trigger, then assert on the opened dropdown's `menuitem`s" pattern — the
 * only other trigger-opens-dropdown component in the codebase.
 */
describe("ExportMenu", () => {
  it("renders a single Exportar trigger (no separate Excel/PDF buttons)", () => {
    render(<ExportMenu path="/api/invoices/export" params={{}} />);

    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
  });

  it("opens a dropdown offering Excel and PDF, each linking to the given path with the given params", async () => {
    const user = userEvent.setup();
    render(
      <ExportMenu
        path="/api/invoices/export"
        params={{ customerId: "cust-1", status: "pending" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /exportar/i }));

    expect(await screen.findByRole("menuitem", { name: "Excel" })).toHaveAttribute(
      "href",
      "/api/invoices/export?customerId=cust-1&status=pending&format=xlsx",
    );
    expect(screen.getByRole("menuitem", { name: "PDF" })).toHaveAttribute(
      "href",
      "/api/invoices/export?customerId=cust-1&status=pending&format=pdf",
    );
  });
});
