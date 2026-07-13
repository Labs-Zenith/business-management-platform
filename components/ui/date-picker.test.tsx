import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DatePicker } from "./date-picker";

const ORIGINAL_TZ = process.env.TZ;

describe("DatePicker", () => {
  afterEach(() => {
    vi.useRealTimers();
    // `process.env.TZ = undefined` does NOT unset the variable — Node
    // stringifies it to the literal `"undefined"`, an invalid IANA zone
    // name that silently falls back to UTC, leaving the rest of this worker
    // process's tests running under a forced (and un-obvious) timezone.
    // Delete the key outright when it was originally unset instead.
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = ORIGINAL_TZ;
    }
  });

  it("shows the placeholder text when value is undefined", () => {
    render(<DatePicker value={undefined} onChange={vi.fn()} placeholder="Selecciona una fecha" />);

    expect(screen.getByRole("button", { name: "Selecciona una fecha" })).toBeInTheDocument();
  });

  it("shows the placeholder text when value is an empty string", () => {
    render(<DatePicker value="" onChange={vi.fn()} placeholder="Selecciona una fecha" />);

    expect(screen.getByRole("button", { name: "Selecciona una fecha" })).toBeInTheDocument();
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });

  it("shows the placeholder instead of crashing when value is a malformed date string", () => {
    render(
      <DatePicker value="not-a-date" onChange={vi.fn()} placeholder="Selecciona una fecha" />
    );

    expect(screen.getByRole("button", { name: "Selecciona una fecha" })).toBeInTheDocument();
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });

  it("does not open the popover and keeps the trigger disabled when disabled is true", async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        value={undefined}
        onChange={vi.fn()}
        placeholder="Selecciona una fecha"
        disabled
      />
    );

    const trigger = screen.getByRole("button", { name: "Selecciona una fecha" });
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays the value formatted as 'd MMM yyyy' in Spanish", () => {
    render(<DatePicker value="2026-07-07" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "7 jul 2026" })).toBeInTheDocument();
  });

  it("opens the popover on trigger click, calls onChange with the picked ISO date, and closes the popover", async () => {
    const user = userEvent.setup();
    // Pin "today" so the calendar opens on a known month without passing `value`.
    vi.setSystemTime(new Date(2026, 6, 7));
    const onChange = vi.fn();

    render(<DatePicker value={undefined} onChange={onChange} placeholder="Selecciona una fecha" />);

    const trigger = screen.getByRole("button", { name: "Selecciona una fecha" });
    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });

    expect(screen.queryByRole("button", { name: dayLabel })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: dayLabel }));

    expect(onChange).toHaveBeenCalledWith("2026-07-20");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: dayLabel })).not.toBeInTheDocument();
    });
  });

  it("calls onChange with an empty string and closes the popover when the already-selected day is clicked again (clearable)", async () => {
    const user = userEvent.setup();
    // Pin "today" far from the target day so the "Hoy," prefix never collides with it.
    vi.setSystemTime(new Date(2000, 0, 1));
    const onChange = vi.fn();

    render(<DatePicker value="2026-07-20" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "20 jul 2026" }));
    const selectedDayLabel = `${format(new Date(2026, 6, 20), "PPPP", { locale: es })}, seleccionado`;
    await user.click(await screen.findByRole("button", { name: selectedDayLabel }));

    expect(onChange).toHaveBeenCalledWith("");
    // The popover closes on either outcome (selection or clear) for
    // consistency — leaving it open only on clear would strand the user in
    // a surprising "stuck open" state.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: selectedDayLabel })).not.toBeInTheDocument();
    });
  });

  it("writes back the exact local calendar day picked, with NO UTC off-by-one, even in a timezone ahead of UTC", async () => {
    const user = userEvent.setup();
    // Asia/Tokyo is UTC+9: local midnight for a given day is the PREVIOUS day in
    // UTC. `date.toISOString().slice(0, 10)` would silently shift the write-back
    // to the wrong (previous) day here — the exact bug `lib/dates.ts`'s
    // `todayIsoDate()` was written to avoid, reproduced at the calendar-day level.
    process.env.TZ = "Asia/Tokyo";
    const onChange = vi.fn();

    render(<DatePicker value="2026-07-20" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "20 jul 2026" }));

    const targetDate = new Date(2026, 6, 21);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await user.click(await screen.findByRole("button", { name: dayLabel }));

    // Sanity check: prove the naive UTC conversion WOULD have produced a
    // different, wrong date in this timezone — otherwise this test wouldn't be
    // exercising the bug at all.
    const buggyIso = targetDate.toISOString().slice(0, 10);
    expect(buggyIso).not.toBe("2026-07-21");

    expect(onChange).toHaveBeenCalledWith("2026-07-21");
    expect(onChange).not.toHaveBeenCalledWith(buggyIso);
  });
});
