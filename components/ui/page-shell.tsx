import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Uniform mobile-first page container — replaces each page's hand-rolled
 * `flex flex-1 flex-col gap-4 p-4` wrapper (`customers/page.tsx`,
 * `invoices/page.tsx`, `invoices/[id]/page.tsx`, ...). Full-width at every
 * breakpoint with responsive padding (`p-4 sm:p-6`) as the only side gutter —
 * no centered max width — so wide screens use the whole available width.
 * Narrow forms keep their own inner `max-w-2xl` where reading width matters.
 */
function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "flex w-full flex-1 flex-col gap-4 p-4 sm:p-6",
        className
      )}
      {...props}
    />
  )
}

export { PageShell }
