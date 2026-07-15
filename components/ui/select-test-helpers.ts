import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/**
 * Shared `Select` (`components/ui/select.tsx`, base-ui `Select`) test
 * gestures, used by every form migrated off a native `<select>` in Wave 2.
 * Mirrors `date-picker-test-helpers.ts`'s "gestures live in exactly one
 * place" convention.
 *
 * The trigger is a labelable `role="combobox"` `<button>`
 * (`components/ui/select.tsx`'s `SelectTrigger`), reachable via its `<Label
 * htmlFor>` association exactly like `DatePicker`'s trigger. The popup's
 * `role="listbox"`/`role="option"` content only mounts once the trigger is
 * opened (base-ui unmounts closed popups, same as this codebase's `Tabs`
 * `keepMounted` precedent implies for panels that do NOT opt in) — every
 * option lookup below opens the trigger first via `findByRole`, never
 * assumes the option is already in the DOM.
 */

/** Opens the `Select` associated with `triggerLabel` without picking anything. */
export async function openSelect(user: ReturnType<typeof userEvent.setup>, triggerLabel: RegExp) {
  await user.click(screen.getByLabelText(triggerLabel));
}

/**
 * Opens the `Select` associated with `triggerLabel` and picks the option
 * whose accessible name is `optionName`.
 */
export async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: RegExp,
  optionName: string | RegExp,
) {
  await openSelect(user, triggerLabel);
  await user.click(await screen.findByRole("option", { name: optionName }));
}
