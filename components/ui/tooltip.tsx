"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * Groups tooltips that mount inside it under a single shared show/hide
 * delay (base-ui's "instant re-open" grouping) — mount ONE per screen
 * region with many triggers (e.g. `dashboard-sidebar.tsx`'s collapsed nav
 * rail) rather than per-tooltip, so hovering across adjacent icons feels
 * like one continuous tooltip instead of re-running the open delay each
 * time. Optional: a bare `Tooltip` still works without a `TooltipProvider`
 * ancestor (each trigger just uses its own default delay).
 */
function TooltipProvider({ ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

/**
 * base-ui's Tooltip docs explicitly do NOT wire up `role="tooltip"` /
 * `aria-describedby` automatically — their recommended pattern is an
 * `aria-label` on the trigger matching the tooltip text instead (see
 * https://base-ui.com/react/components/tooltip, "Usage guidelines"). We
 * still set `role="tooltip"` on the popup ourselves below so assistive
 * tech and tests can find it via the standard tooltip role; it's additive
 * and doesn't conflict with a trigger that gets its accessible name from
 * its own content, `aria-label`, or (as `nav-link.tsx` does) `title`.
 */
function TooltipContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "top",
  sideOffset = 8,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          role="tooltip"
          className={cn(
            "z-50 w-fit max-w-64 origin-(--transform-origin) rounded-md border border-border bg-popover px-2 py-1 text-body-sm text-popover-foreground outline-hidden duration-100 motion-reduce:duration-0 motion-reduce:transition-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
