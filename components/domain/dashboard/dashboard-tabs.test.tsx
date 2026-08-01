import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { DashboardTabs } from "./dashboard-tabs";

const FORM_ID = "test-form";

function Harness({ defaultValue = "ingresos" }: { defaultValue?: string }) {
  return (
    <>
      {/* Stands in for `page.tsx`'s empty `<form id={FILTER_FORM_ID}>` — the
          hidden `tab` input below targets it purely via `form={FORM_ID}`. */}
      <form id={FORM_ID} />
      <DashboardTabs defaultValue={defaultValue} formId={FORM_ID}>
        <TabsList>
          <TabsTab value="ingresos">Ingresos</TabsTab>
          <TabsTab value="egresos">Egresos</TabsTab>
        </TabsList>
        <TabsPanel value="ingresos" keepMounted>
          Ingresos content
        </TabsPanel>
        <TabsPanel value="egresos" keepMounted>
          Egresos content
        </TabsPanel>
      </DashboardTabs>
    </>
  );
}

function tabInput(): HTMLInputElement {
  return document.querySelector('input[name="tab"]') as HTMLInputElement;
}

describe("DashboardTabs", () => {
  it("seeds the hidden tab input with defaultValue, associated to the given form", () => {
    render(<Harness defaultValue="egresos" />);

    expect(tabInput().value).toBe("egresos");
    expect(tabInput().getAttribute("form")).toBe(FORM_ID);
  });

  it("keeps the active tab as the default on initial render", () => {
    render(<Harness defaultValue="ingresos" />);

    expect(screen.getByRole("tab", { name: "Ingresos" })).toHaveAttribute("aria-selected", "true");
  });

  // The whole reason this wrapper exists: without syncing the hidden input on
  // every switch, `PeriodMenu`'s submit (a full GET navigation) would carry
  // whatever tab the server last rendered, not the one the user is actually
  // looking at — silently snapping Egresos back to Ingresos.
  it("updates the hidden tab input's live value when the active tab changes", async () => {
    const user = userEvent.setup();
    render(<Harness defaultValue="ingresos" />);

    expect(tabInput().value).toBe("ingresos");

    await user.click(screen.getByRole("tab", { name: "Egresos" }));

    expect(tabInput().value).toBe("egresos");
  });
});
