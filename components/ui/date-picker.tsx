"use client"

import * as React from "react"
import { format, isValid, parseISO } from "date-fns"
// NOTE: these are TWO DIFFERENT packages' `es` exports, for TWO DIFFERENT
// purposes — do not collapse them into one import. `date-fns/locale`'s `es`
// only carries the strings `date-fns`'s own `format()` needs for display
// text. `react-day-picker/locale`'s `es` is a superset built for the
// `Calendar` component: it also carries `.labels` (labelDayButton,
// labelNext, labelPrevious, etc.) that react-day-picker needs for its own
// UI strings and that `date-fns/locale`'s `es` does not provide. Using
// `date-fns/locale`'s `es` for the `Calendar`'s `locale` prop silently falls
// back to English for those labels — a real bug caught during this
// component's own development.
import { es } from "date-fns/locale"
import { es as rdpEs } from "react-day-picker/locale"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DISPLAY_FORMAT = "d MMM yyyy"

export type DatePickerProps = {
  /**
   * ISO `YYYY-MM-DD` string, or `""`/`undefined` when no date is selected.
   * Intentionally a plain string, never a `Date` object: passing `Date`
   * through the prop boundary invites callers to build it with
   * `new Date(...)`/`.toISOString()` at the call site, which is how the
   * UTC-vs-local off-by-one bug documented in `lib/dates.ts` gets
   * reintroduced. Keeping the contract string-only forces the local-time
   * conversion to happen once, here, at the `parseISO`/`format` boundary.
   */
  value?: string
  /** Emits an ISO `YYYY-MM-DD` string, or `""` when the date is cleared. */
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  disabled,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const parsed = value ? parseISO(value) : undefined
  // A malformed `value` (e.g. corrupt/truncated data from an upstream API or
  // DB) makes `parseISO` return an `Invalid Date`, which is truthy — guard
  // explicitly and treat it the same as "no value" instead of letting
  // `format()` throw ("Invalid time value") and crash the render tree.
  const selected = parsed && isValid(parsed) ? parsed : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            data-slot="date-picker-trigger"
            className={cn(
              "w-full justify-start text-left font-normal",
              !selected && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-4" />
            {selected ? format(selected, DISPLAY_FORMAT, { locale: es }) : placeholder}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0" data-slot="date-picker-content">
        <Calendar
          mode="single"
          locale={rdpEs}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            // MUST use date-fns's local-time-based `format()` here, never
            // `date.toISOString().slice(0, 10)` — that reintroduces the
            // UTC-vs-local timezone off-by-one bug this project has already
            // been bitten by once (see `lib/dates.ts`'s docstring for the
            // same convention).
            onChange(date ? format(date, "yyyy-MM-dd") : "")
            // Close on either a selection or a clear: leaving the popover
            // open after clearing would strand the user in a "stuck open"
            // state with no visible reason, which is more surprising than
            // closing consistently regardless of which outcome occurred.
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
