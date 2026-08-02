import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { selectOption } from "@/components/ui/select-test-helpers";
import { SelectFilterField } from "./select-filter-field";

/**
 * The test this component shipped without — and the reason its auto-submit
 * regression reached users.
 *
 * `SelectFilterField` auto-submits the surrounding native GET form when a
 * value is picked, so the ONLY assertion that matters is what lands in the
 * submitted `FormData`. Asserting that the popup renders the right options
 * (which `app/(dashboard)/invoices/page.test.tsx` already did) cannot catch a
 * stale-value submit, because the options are correct either way.
 *
 * The original implementation called `form.requestSubmit()` synchronously
 * inside base-ui's `onValueChange`, which runs BEFORE `setValueUnwrapped`
 * commits the new value (see `@base-ui/react`'s `select/root/SelectRoot.js`).
 * The form was therefore serialized with the PREVIOUS value: picking a filter
 * did nothing, and an applied filter could not be cleared.
 */

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagada" },
];

/** Renders the field inside a real form, capturing every submitted FormData. */
function renderInForm(defaultValue?: string) {
  const submissions: Array<Record<string, string>> = [];
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
    // Prevent the jsdom "Not implemented: form submission" navigation error.
    event.preventDefault();
    submissions.push(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>);
  });

  const view = render(
    <form method="get" onSubmit={onSubmit}>
      <label htmlFor="status">Estado</label>
      <SelectFilterField id="status" name="status" defaultValue={defaultValue} options={STATUS_OPTIONS} />
      <input type="hidden" name="sort" value="total" />
    </form>,
  );

  return { submissions, ...view };
}

describe("SelectFilterField", () => {
  it("does not submit on mount", () => {
    const { submissions } = renderInForm();
    expect(submissions).toEqual([]);
  });

  it("submits the value that was just picked, not the previous one", async () => {
    const user = userEvent.setup();
    const { submissions } = renderInForm();

    await selectOption(user, /estado/i, "Pagada");

    // The regression assertion: this was `{ status: "" }` before the fix.
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("paid");
  });

  it("clears an applied filter when 'Todos' is picked", async () => {
    const user = userEvent.setup();
    const { submissions } = renderInForm("paid");

    await selectOption(user, /estado/i, "Todos");

    // Previously this re-submitted "paid", so a filter could never be removed.
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe("");
  });

  it("submits a second pick, and each one carries its own value", async () => {
    const user = userEvent.setup();
    const { submissions } = renderInForm();

    await selectOption(user, /estado/i, "Pagada");
    await selectOption(user, /estado/i, "Pendiente");

    expect(submissions.map((entry) => entry.status)).toEqual(["paid", "pending"]);
  });

  it("carries the form's other fields along, so sorting survives filtering", async () => {
    const user = userEvent.setup();
    const { submissions } = renderInForm();

    await selectOption(user, /estado/i, "Pagada");

    expect(submissions[0].sort).toBe("total");
  });

  it("exposes exactly one element carrying the field name", () => {
    const { container } = renderInForm("paid");

    // base-ui's `Select` renders its OWN hidden input when given a `name`.
    // This component owns the named input instead, so the value cannot be
    // submitted twice under the same key.
    expect(container.querySelectorAll('[name="status"]')).toHaveLength(1);
  });

  it("shows the default value's label on the trigger", () => {
    renderInForm("paid");
    expect(screen.getByLabelText(/estado/i)).toHaveTextContent("Pagada");
  });

  it("shows the all-label when no filter is applied", () => {
    renderInForm();
    expect(screen.getByLabelText(/estado/i)).toHaveTextContent("Todos");
  });
});
