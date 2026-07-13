import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Shared `DatePicker` (`components/ui/date-picker.tsx`) test gestures, used
 * by every RHF `Controller`-wired form that embeds it (invoice, expense, and
 * upcoming payroll/payment forms) so the interaction details below live in
 * exactly one place instead of being copy-pasted per form test file.
 */

/** Same "d MMM yyyy" / `es` locale `DatePicker` uses for its trigger display text. */
export const displayDate = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: es });

/**
 * Opens the `DatePicker` associated with `triggerLabel` (via its `<Label
 * htmlFor>` — the trigger is a labelable `<button>`, per
 * `components/ui/date-picker.tsx`'s design) and picks the day whose
 * `react-day-picker` accessible name is `dayLabel` (Spanish `PPPP` format,
 * see `date-picker.test.tsx`).
 */
export async function pickDay(user: ReturnType<typeof userEvent.setup>, triggerLabel: RegExp, dayLabel: string) {
  await user.click(screen.getByLabelText(triggerLabel));
  await user.click(await screen.findByRole("button", { name: dayLabel }));
}

/**
 * Re-opens the `DatePicker` associated with `triggerLabel` and re-clicks the
 * ALREADY-SELECTED day identified by `dayLabel` to clear it back to `""`,
 * exercising `DatePicker`'s clearable-toggle gesture (`date-picker.tsx`'s
 * `onSelect` handler emits `""` when `date` is `undefined`, which
 * `react-day-picker` does when the currently selected day is clicked again;
 * see `date-picker.test.tsx`'s "clearable" test for the underlying proof).
 *
 * `react-day-picker`'s Spanish locale (`react-day-picker/locale`'s `es`)
 * appends `", seleccionado"` to a day's accessible name once it is selected
 * (and prefixes `"Hoy, "` when it is also today) — see
 * `node_modules/react-day-picker/dist/esm/locale/es.js`. Callers MUST pass a
 * `dayLabel` for a day that is NOT "today" (pin `vi.setSystemTime` to a date
 * other than the target, as `date-picker.test.tsx`'s own clearable test
 * does), otherwise the accessible name would also carry the `"Hoy, "`
 * prefix and this lookup would not find the button.
 */
export async function clearDay(user: ReturnType<typeof userEvent.setup>, triggerLabel: RegExp, dayLabel: string) {
  await user.click(screen.getByLabelText(triggerLabel));
  await user.click(await screen.findByRole("button", { name: `${dayLabel}, seleccionado` }));
}
