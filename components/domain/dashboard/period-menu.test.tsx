import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DashboardPeriod, PeriodOption } from "@/lib/services/dashboard-period";
import { PeriodMenu } from "./period-menu";

const PERIOD: DashboardPeriod = {
  key: "2026-07",
  preset: "month",
  label: "Julio 2026",
  from: "2026-07-01",
  to: "2026-07-31",
  chartMonths: ["2026-07"],
};

const PRESETS: PeriodOption[] = [
  { value: "last30", label: "Últimos 30 días" },
  { value: "all", label: "Todo" },
];

const MONTHS: PeriodOption[] = [
  { value: "2026-08", label: "Agosto 2026" },
  { value: "2026-07", label: "Julio 2026" },
];

/**
 * `PeriodMenu`'s options are real `<button type="submit" form={formId}>`s
 * rendered inside a Portal (see the component's own doc comment for why), so
 * this harness renders a real `<form>` elsewhere in the tree — exactly like
 * `page.tsx`'s empty `<form id={FILTER_FORM_ID}>` — with a hidden `tab` input
 * standing in for the one `dashboard-tabs.tsx` normally owns.
 *
 * Reading `new FormData(form, submitter)` happens SYNCHRONOUSLY inside the
 * `onSubmit` handler: React nulls `event.currentTarget` once the handler
 * returns, so capturing `form`/`submitter` and building the `FormData` before
 * any `await` is required, not a style choice.
 */
function Harness({ onSubmit, tab = "egresos" }: { onSubmit: (data: FormData) => void; tab?: string }) {
  return (
    <>
      <form
        id="test-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          onSubmit(new FormData(form, submitter ?? undefined));
        }}
      >
        <input type="hidden" name="tab" form="test-form" defaultValue={tab} />
      </form>
      <PeriodMenu period={PERIOD} presets={PRESETS} months={MONTHS} formId="test-form" />
    </>
  );
}

describe("PeriodMenu", () => {
  it("shows the active period's label on the trigger", () => {
    render(<Harness onSubmit={() => {}} />);

    expect(screen.getByRole("button", { name: /julio 2026/i })).toBeInTheDocument();
  });

  it("carries the explicit data-slot that keeps the trigger from hydration-mismatching", () => {
    render(<Harness onSubmit={() => {}} />);

    expect(screen.getByRole("button", { name: /julio 2026/i })).toHaveAttribute(
      "data-slot",
      "dropdown-menu-trigger",
    );
  });

  it("lists presets and months in separate groups", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => {}} />);

    await user.click(screen.getByRole("button", { name: /julio 2026/i }));

    expect(await screen.findByRole("menuitem", { name: /últimos 30 días/i })).toBeInTheDocument();
    expect(screen.getByText("Periodos")).toBeInTheDocument();
    expect(screen.getByText("Meses")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /agosto 2026/i })).toBeInTheDocument();
  });

  // The load-bearing assertion: picking a period must submit BOTH the chosen
  // `period` and the form's LIVE `tab` value — not just the period — or a
  // period pick while on the Egresos tab would bounce the user back to
  // Ingresos on navigation (see `dashboard-tabs.tsx`'s doc comment).
  it("submits both the picked period and the form's live tab value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} tab="egresos" />);

    await user.click(screen.getByRole("button", { name: /julio 2026/i }));
    await user.click(await screen.findByRole("menuitem", { name: /agosto 2026/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0] as FormData;
    expect(data.get("period")).toBe("2026-08");
    expect(data.get("tab")).toBe("egresos");
  });

  it("marks the currently active option with a visible check", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => {}} />);

    await user.click(screen.getByRole("button", { name: /julio 2026/i }));
    await screen.findByRole("menuitem", { name: /últimos 30 días/i });

    // Two "Julio 2026" entries exist (trigger label + the month option) —
    // scope to the menuitem and inspect its icon's visibility class.
    const activeItem = screen.getAllByRole("menuitem", { name: /julio 2026/i })[0];
    const icon = activeItem.querySelector("svg");
    expect(icon).not.toHaveClass("invisible");
  });
});
