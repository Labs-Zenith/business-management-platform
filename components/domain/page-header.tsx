import type { ReactNode } from "react";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
};

/**
 * Shared page-header markup — encapsulates the pattern hand-rolled on every
 * page (`customers/page.tsx`, `invoices/page.tsx`): an optional breadcrumb
 * slot above the title, `text-headline` `<h1>`, a muted description
 * paragraph, and a responsive actions row that stacks to full-width buttons
 * on mobile and sits to the right on desktop (mirrors `invoices/[id]/page.tsx`'s
 * breadcrumb + title + actions layout for detail pages too).
 */
export function PageHeader({ title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        {breadcrumb}
        <h1 className="text-headline">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
      ) : null}
    </div>
  );
}
