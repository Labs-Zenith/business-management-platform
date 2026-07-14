import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Uniform mobile-first page container — replaces each page's hand-rolled
 * `flex flex-1 flex-col gap-4 p-4` wrapper (`customers/page.tsx`,
 * `invoices/page.tsx`, `invoices/[id]/page.tsx`, ...). Full-width with
 * padding on mobile, centered with a max width on desktop, so every screen
 * shares the same centered structure.
 */
function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6",
        className
      )}
      {...props}
    />
  )
}

export { PageShell }
