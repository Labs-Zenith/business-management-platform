import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { clearDay, pickDay } from "@/components/ui/date-picker-test-helpers";

import { DateFilterField } from "./date-filter-field";

/**
 * `DateFilterField` is a progressive-enhancement island: a real Server
 * Component render never runs `useEffect` at all, so `renderToStaticMarkup`
 * (not `@testing-library/react`'s `render`) is the only way to observe the
 * true pre-mount/no-JS output in this suite. `render()` wraps every commit in
 * `act()`, which flushes pending passive effects (`useEffect`) synchronously
 * before returning — by the time `render()` resolves, `mounted` would
 * already be `true` and the "before any client-side effect runs" case would
 * be impossible to observe with it.
 */

describe("DateFilterField", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders a native, submittable <input type=\"date\" name=\"from\"> before any client-side effect runs (no-JS/SSR path)", () => {
    const html = renderToStaticMarkup(
      <DateFilterField name="from" id="from" label="Desde" defaultValue="2026-07-01" />,
    );

    expect(html).toContain('name="from"');
    expect(html).toContain('type="date"');
    expect(html).toContain('id="from"');
    expect(html).toContain('value="2026-07-01"');
    // Exactly one input exists at this point — the native one — so there is
    // no `type="hidden"` input and no duplicate `name="from"` param risk.
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).not.toContain('type="hidden"');
  });

  it("renders a clean <input type=\"date\" name=\"from\"> with no stray value=\"\" attribute when defaultValue is undefined (fresh page load, no filter applied yet)", () => {
    const html = renderToStaticMarkup(<DateFilterField name="from" id="from" label="Desde" />);

    expect(html).toContain('name="from"');
    expect(html).toContain('type="date"');
    expect(html).toContain('id="from"');
    // No `from`/`to` query param yet (real-world initial state of both
    // pages) means `defaultValue` is `undefined` — the native input must
    // NOT carry a stray `value=""` attribute for that case.
    expect(html).not.toContain("value=");
    expect(html.match(/<input/g)).toHaveLength(1);
  });

  it("swaps to the DatePicker UI post-mount, and picking a date updates the hidden input's value (which is what actually submits)", async () => {
    vi.setSystemTime(new Date(2026, 6, 7));
    const user = userEvent.setup();
    const { container } = render(
      <DateFilterField name="from" id="from" label="Desde" defaultValue="2026-07-01" />,
    );

    // Post-mount: the native date input is gone; a hidden input (the one
    // that actually submits) plus the `DatePicker` trigger are shown.
    expect(container.querySelector('input[type="date"]')).not.toBeInTheDocument();
    const hiddenInput = container.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe("2026-07-01");
    expect(screen.getByLabelText(/desde/i)).toHaveTextContent("1 jul 2026");

    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /desde/i, dayLabel);

    expect(hiddenInput.value).toBe("2026-07-20");
    expect(screen.getByLabelText(/desde/i)).toHaveTextContent("20 jul 2026");
    // Only ONE input ever carries `name="from"` at a time — no duplicate
    // GET param risk once enhanced either.
    expect(container.querySelectorAll('input[name="from"]')).toHaveLength(1);
  });

  it("clearing an already-picked date via the DatePicker's toggle-to-clear gesture blanks the hidden input's value (a filter has no required-field validation, so this is a legitimate 'no filter applied' state)", async () => {
    vi.setSystemTime(new Date(2026, 6, 7));
    const user = userEvent.setup();
    const { container } = render(
      <DateFilterField name="from" id="from" label="Desde" defaultValue="2026-07-01" />,
    );

    const hiddenInput = container.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("2026-07-01");

    // Pick a non-today day first so the clear-gesture lookup (`clearDay`)
    // never collides with react-day-picker's "Hoy, " accessible-name prefix.
    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /desde/i, dayLabel);
    expect(hiddenInput.value).toBe("2026-07-20");

    await clearDay(user, /desde/i, dayLabel);

    // Unlike the REQUIRED DatePicker fields elsewhere in this rollout
    // (invoice issueDate, payroll dates, payment paymentDate), a filter
    // field has no validation requirement — clearing it back to "" is a
    // legitimate, unblocked action (it simply means "no filter applied"
    // once the form is submitted), not an error state.
    expect(hiddenInput.value).toBe("");
    expect(screen.getByLabelText(/desde/i)).toHaveTextContent(/seleccionar fecha/i);
    // Still exactly one input carrying `name="from"` — the clear gesture
    // doesn't resurrect the native input or create a duplicate.
    expect(container.querySelectorAll('input[name="from"]')).toHaveLength(1);
  });

  it("hydrates the SSR markup with no console error: the first client render matches the SSR native <input> exactly (no hydration mismatch)", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <DateFilterField name="from" id="from" label="Desde" defaultValue="2026-07-01" />,
    );
    document.body.appendChild(container);

    try {
      act(() => {
        hydrateRoot(
          container,
          <DateFilterField name="from" id="from" label="Desde" defaultValue="2026-07-01" />,
        );
      });

      // React logs "Hydration failed..."/"Text content does not match..." to
      // `console.error` the instant it detects a server/client markup
      // mismatch during `hydrateRoot`. Asserting it was never called is the
      // direct proof there was none here.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(container);
    }
  });
});
