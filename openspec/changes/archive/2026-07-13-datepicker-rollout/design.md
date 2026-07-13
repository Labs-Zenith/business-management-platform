# Design: DatePicker Rollout

## Technical Approach

Add one reusable `components/ui/date-picker.tsx` (Popover + Calendar + Button
trigger) mirroring `select.tsx`'s wrapper convention, then migrate 10 call
sites across 3 integration patterns. The component's PUBLIC contract stays a
plain ISO `YYYY-MM-DD` string — `date-fns` `parseISO`/`format` convert at the
Date boundary only, so no consumer, schema, or payload changes. Two migration
patterns are load-bearing and get isolated PRs: the payroll live period
preview (RHF reactivity) and the native-GET filter-bar islands (no-JS submit).

## Architecture Decisions

### Decision: String-only public API, boundary conversion via date-fns

**Choice**: `value: string | undefined` (ISO) / `onChange: (v: string) => void`.
Internally `parseISO(value)` → `Date` for the Calendar; on select,
`format(date, "yyyy-MM-dd")` back to ISO. Display via
`format(date, "d MMM yyyy", { locale: es })` → "7 jul 2026".
**Alternatives**: expose `Date` objects (rejected — leaks Date across every
call site, forces conversions in 6 files, breaks the unchanged-payload goal).
**Rationale**: every existing field is already an ISO string; a string contract
is a drop-in. **CRITICAL**: write-back MUST use `format(date, "yyyy-MM-dd")`
(local calendar date), NEVER `date.toISOString().slice(0,10)` — the latter
reintroduces the exact UTC off-by-one `lib/dates.ts` documents. `parseISO` on a
date-only string yields local midnight, so the round-trip is stable.

### Decision: `value: string | undefined` + placeholder for optional dates

**Choice**: empty (`""`/`undefined`) shows `placeholder`; `mode="single"` lets a
click on the selected day deselect → `onChange("")`, keeping `dueDate`
clearable with no forced default. **Rationale**: required fields pass
`todayIsoDate()` so are never empty; only `dueDate` needs the empty state.

### Decision: `<Label htmlFor={id}>` associates with the trigger BUTTON

**Choice**: pass `id` through `DatePicker` to the trigger `Button`; keep each
form's existing `<Label htmlFor="...">`. `<button>` is a labelable element, so
`getByLabelText(/fecha.../i)` keeps returning the field's trigger — minimal
test churn and unambiguous per-field selection. **Rationale**: avoids brittle
role/`within()` scoping when two date fields both show today's date. Fallback if
jsdom label-to-button association is flaky: scope with `within(container)`.

## Component API

```tsx
// components/ui/date-picker.tsx  ("use client")
const DISPLAY_FORMAT = "d MMM yyyy";
export type DatePickerProps = {
  value: string | undefined;               // ISO YYYY-MM-DD | "" when empty
  onChange: (value: string) => void;       // emits "" when cleared
  placeholder?: string; disabled?: boolean; id?: string;
};
export function DatePicker({ value, onChange, placeholder = "Seleccionar fecha", disabled, id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button id={id} type="button" variant="outline" disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="size-4" />
          {selected ? format(selected, DISPLAY_FORMAT, { locale: es }) : placeholder}
        </Button>
      } />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" locale={es} selected={selected} defaultMonth={selected}
          onSelect={(date) => { onChange(date ? format(date, "yyyy-MM-dd") : ""); if (date) setOpen(false); }} />
      </PopoverContent>
    </Popover>
  );
}
```

`PopoverTrigger render={...}` mirrors `DialogTrigger render={trigger}`.

**Correction from PR1 apply (locale bug caught before it could spread)**: this
sample's single `es` import for both `format()` and `Calendar`'s `locale` prop
is WRONG — `date-fns/locale`'s `es` lacks the `.labels` react-day-picker needs
(`labelDayButton`/`labelNext`/`labelPrevious`), so `Calendar`'s day-cell/nav
aria-labels silently fall back to English. Use TWO separate imports instead:
```tsx
import { es } from "date-fns/locale";                  // for format() display text
import { es as rdpEs } from "react-day-picker/locale"; // for Calendar's locale prop
```
and pass `locale={rdpEs}` to `Calendar`, not `locale={es}`. Any PR touching
`date-picker.tsx` again must use this two-import pattern.

## Integration Patterns

### PR2 — RHF via `Controller` (invoice, expense, payroll)

Swap `<Input type="date" {...register("x")} />` for:
```tsx
<Controller control={control} name="x" render={({ field }) => (
  <DatePicker id="..." value={field.value} onChange={field.onChange} />
)} />
```
Sites: invoice `issueDate`+`dueDate`; expense `expenseDate`; payroll
`referenceDate`+`paymentDate`.

**Payroll live-period preview — HIGHEST RISK, exact wiring.** The preview reads
`const referenceDate = useWatch({ control, name: "referenceDate" })` and derives
`preview` via `computePeriod`/`periodDays`. That code stays **byte-for-byte
identical**. Only the input changes:
```tsx
// BEFORE
<Input id="payroll-reference-date" type="date" {...register("referenceDate")} />
// AFTER
<Controller control={control} name="referenceDate" render={({ field }) => (
  <DatePicker id="payroll-reference-date" value={field.value} onChange={field.onChange} />
)} />
```
Mechanism: `field.onChange(newIso)` writes the same RHF field state that
`register()` wrote, so the `useWatch` subscriber re-renders and `preview`
recomputes on every pick. `periodType` (still a `register()` `<select>`) and the
`useWatch(... "periodType")` line are untouched. Same swap for `paymentDate`.

### PR4a — Plain useState (payment-form)

```tsx
<DatePicker id="payment-date" value={values.paymentDate}
  onChange={(v) => updateField("paymentDate", v)} />
```
Removes the native input; state stays the source of truth (submission already
reads `values`, not the DOM), so no other change.

### PR4b — Native-GET filter-bar islands — HIGHEST RISK

`invoices/page.tsx` / `payments/page.tsx` are Server Components with
`<form method="get">`; a no-JS GET submit must keep working. New client island
does progressive enhancement — native `type="date"` on SSR/no-JS, DatePicker
after hydration, and only ONE input carries `name` at a time (no dup-param
conflict):
```tsx
// components/domain/filters/date-filter-field.tsx  ("use client")
export function DateFilterField({ name, defaultValue, label, id }: {
  name: string; defaultValue?: string; label: string; id: string }) {
  const [mounted, setMounted] = React.useState(false);
  const [value, setValue] = React.useState(defaultValue ?? "");
  React.useEffect(() => setMounted(true), []);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      {mounted ? (
        <>
          <input type="hidden" name={name} value={value} />
          <DatePicker id={id} value={value} onChange={setValue} />
        </>
      ) : (
        <input id={id} name={name} type="date" defaultValue={defaultValue ?? ""}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none" />
      )}
    </div>
  );
}
```
Pages replace the two `<Input ... type="date" name="from|to">` blocks with
`<DateFilterField name="from" id="from" label="Desde" defaultValue={params.from} />`
(and `to`), inside the SAME `<form method="get">`. No-JS: native input submits
normally. JS: hidden input carries the picked value; Calendar provides UX. First
client render matches SSR (both native input) then the effect swaps — no
hydration mismatch.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `date-picker.tsx` | Render; assert placeholder when empty; open via trigger; click a day; assert `onChange` fired with ISO; re-click selected day → `onChange("")` |
| Component | 4 form tests | Replace `fireEvent.change(input,{value})` + `.toHaveValue()` with open-and-pick |
| Island | filter pages | Assert native `type="date"` present pre-mount; hidden input carries picked value post-mount |

**New interaction pattern.** react-day-picker v10 day cells are `<button>`s whose
accessible name (verified in `locale/es.js` `labelDayButton`) is the Spanish
`PPPP` date, e.g. `"domingo, 5 de julio de 2026"` (today → `"Hoy, ..."`,
selected → `"..., seleccionado"`). Helper:
```tsx
async function pickDay(user, fieldLabel: RegExp, dayLabel: RegExp) {
  await user.click(screen.getByLabelText(fieldLabel));           // open popover (trigger button)
  await user.click(await screen.findByRole("button", { name: dayLabel }));
}
// e.g. await pickDay(user, /fecha de referencia/i, /5 de julio de 2026/i);
```
Match the full `de julio de 2026` substring to disambiguate 5/15/25. Assert the
picked value via the trigger's text: `expect(screen.getByLabelText(/fecha de
referencia/i)).toHaveTextContent("5 jul 2026")`, and/or the existing submit-payload
assertion (`referenceDate: "2026-07-05"`) which already pins the ISO value.

**Pinned time is required.** Default value is `todayIsoDate()`, so the calendar
opens on today's month; tests `vi.setSystemTime(new Date("2026-07-07..."))` so all
target days (5/15/16/20) are in the visible month — no month navigation needed.
The payroll preview tests keep their `computePeriod`/`periodDays` assertions; only
the date-setting step changes from `fireEvent.change` to `pickDay`.

## PR / Task Breakdown

| PR | Scope | Est. lines | Risk |
|----|-------|-----------|------|
| PR1 | `date-picker.tsx` + unit test | ~180 | Low |
| PR2 | RHF: invoice + expense (2 files + 2 tests) | ~200 | Med |
| PR3 | RHF: payroll only (form + test rewrite) | ~180 | **High** |
| PR4 | payment useState + 2 filter islands + `DateFilterField` + tests | ~260 | **High** |

**Recommendation: 4 slices, not 3.** Splitting the original PR2 so payroll is
its own PR isolates the highest-risk reactivity wiring (and its preview-heavy
test rewrite) for focused review, and keeps every slice under the 400-line
budget. PR4 groups the two remaining low-coupling patterns; if it forecasts over
400, split the filter islands (PR4b) from the payment dialog (PR4a).

**Decision needed before apply: Yes** (confirm 4-slice split).
**Chained PRs recommended: Yes.** **400-line budget risk: Low** per slice.

## Migration / Rollout

No data migration. Each PR is independently revertible; reverting any migration
re-exposes native inputs with the unchanged ISO value contract.

## Open Questions

- [ ] Confirm jsdom associates `<label htmlFor>` with the trigger `<button>` so
  `getByLabelText` returns it; if not, fall back to `within(container)` scoping.
- [ ] Confirm the 4-slice PR split (payroll isolated) over the proposal's 3.

---

## Addendum (added at archive time — not part of the original design.md)

Confirmed against the shipped code at archive time (all 4 PRs, commits
`6ef051e`/`7db5026`/`837750c`/`1627828`):

- Both jsdom `Open Questions` above resolved affirmatively during implementation
  (label-to-button association worked; the 4-slice split shipped as planned) —
  left the checkboxes above as `[ ]` to preserve the original artifact verbatim;
  see `archive-report.md` for the resolved status.
- The two-import locale fix (`date-fns/locale`'s `es` for `format()`,
  `react-day-picker/locale`'s `es` for `Calendar`) is present in
  `components/ui/date-picker.tsx` with inline documentation.
- One additional real bug beyond what this design.md anticipated, found and
  fixed during PR4 apply: the design's `DateFilterField` sample used
  `useState(false)` + `useEffect(() => setMounted(true), [])` for mount
  detection, which trips `eslint-plugin-react-hooks`'s `set-state-in-effect`
  rule (hard ERROR in this repo's config). Shipped code uses
  `React.useSyncExternalStore` instead — React's documented idiom for this case.
- Full list of real bugs caught and fixed during development (locale-import
  collision, UTC off-by-one guard, invalid-date-string crash guard, broken
  TZ-restore in a test's `afterEach`, stray `value=""` SSR attribute, and
  missing page-level wiring tests) is documented in `archive-report.md`.
