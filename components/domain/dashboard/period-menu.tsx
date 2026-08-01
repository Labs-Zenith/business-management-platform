"use client";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { DashboardPeriod, PeriodOption } from "@/lib/services/dashboard-period";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Dashboard period selector — the header control that lets a past month be
 * viewed (and, via `DashboardExportMenu`, exported).
 *
 * Every option below is a `<button type="submit" name="period" value={...}>`,
 * NOT a `<Link href="?period=X&tab=Y">`. A `Link` was tried first and
 * rejected: its `href` is computed at server-render time, so it would have to
 * freeze the `tab` query param at whatever the page last rendered with — but
 * which tab is active is entirely client-side state (`dashboard-tabs.tsx`).
 * Picking a period while sitting on the Egresos tab would silently navigate
 * back to Ingresos on submit. A form submission instead reads the hidden
 * `tab` input's LIVE value at submit time, so the navigation always carries
 * whatever tab was actually on screen.
 *
 * Four mechanics make that submit work, and each is load-bearing:
 *
 * 1. `Menu.Item` renders a plain `<div>` by default — `nativeButton` defaults
 *    to `false`, since most menu items are never actual form controls — so
 *    getting a real `<button>` into the DOM requires routing it through the
 *    `render` prop, which `nativeButton` + `render` do together below.
 * 2. base-ui merges `render.props` (this component's own `type`/`name`/
 *    `value`/`form`) onto the element LAST, after its own internal props, so
 *    `type="submit"` wins over whatever base-ui would otherwise apply. Its
 *    item click handler only ever emits a `close` action — it never calls
 *    `preventDefault()` — so the browser's native form submission still fires.
 * 3. The dropdown's popup renders in a Portal (`DropdownMenuContent`), so
 *    these buttons are NOT DOM descendants of `<form id={formId}>`. The only
 *    thing associating each one with the form is the native `form={formId}`
 *    attribute, which works across the Portal boundary because it targets the
 *    form by id, not by ancestry.
 * 4. `data-slot` on the trigger must stay explicit
 *    (`data-slot="dropdown-menu-trigger"`) or the trigger
 *    hydration-mismatches — same issue and same fix as
 *    `components/domain/export-menu.tsx`'s trigger.
 */
export type PeriodMenuProps = { period: DashboardPeriod; presets: PeriodOption[]; months: PeriodOption[]; formId: string };

function PeriodMenuItem({ option, activeKey, formId }: { option: PeriodOption; activeKey: string; formId: string }) {
  const isActive = option.value === activeKey;
  return (
    <DropdownMenuItem nativeButton render={<button type="submit" name="period" value={option.value} form={formId} />}>
      <CheckIcon className={isActive ? "size-4" : "size-4 invisible"} aria-hidden />
      {option.label}
    </DropdownMenuItem>
  );
}

export function PeriodMenu({ period, presets, months, formId }: PeriodMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button variant="outline" data-slot="dropdown-menu-trigger" className="w-full sm:w-auto">
          {period.label}
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>} />
      <DropdownMenuContent align="end" className="max-h-80 min-w-48 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Periodos</DropdownMenuLabel>
          {presets.map((o) => <PeriodMenuItem key={o.value} option={o} activeKey={period.key} formId={formId} />)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Meses</DropdownMenuLabel>
          {months.map((o) => <PeriodMenuItem key={o.value} option={o} activeKey={period.key} formId={formId} />)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
