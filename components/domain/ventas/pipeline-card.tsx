"use client";

/**
 * A single kanban card in the Ventas board (`ventas-board.tsx`). Draggable
 * via `@dnd-kit/sortable`'s `useSortable` (the board wraps each column's
 * cards in a `SortableContext`, per that file's doc comment for the overall
 * multi-container DnD approach).
 *
 * CLICK-vs-DRAG: `PointerSensor`'s `activationConstraint: { distance: 8 }`
 * (configured in `ventas-board.tsx`) means a plain click (no meaningful
 * pointer movement) never crosses the drag-activation threshold, so this
 * card's own `onClick` fires normally for a click and is naturally
 * suppressed by the browser for an actual drag gesture — no extra
 * `isDragging` guard is needed for that distinction. `isDragging` is only
 * used here to dim the source card while its `DragOverlay` twin is shown.
 *
 * The detail dialog (`card-detail-dialog.tsx`, lazy `dynamic(ssr:false)`) is
 * a CONTROLLED dialog (no `trigger` prop, unlike `nueva-card-dialog.tsx`) —
 * this card owns the `open` boolean itself and toggles it on click, since
 * the "trigger" here is the whole card (a `useSortable` draggable node),
 * not a separate button `DialogTrigger` could wrap.
 *
 * `setNodeRef`/`transform`/`attributes`/`listeners` are applied to a plain
 * wrapping `<div>`, NOT `<Card>` itself — `Card` (`components/ui/card.tsx`)
 * is a plain function component (not `forwardRef`) typed as
 * `React.ComponentProps<"div">` with no `ref` in its prop type, so passing
 * `ref={setNodeRef}` straight to `<Card>` would be a type error. The wrapper
 * carries the drag transform/listeners; `Card` itself only carries the
 * visual styling and the click-to-open handler.
 */

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MoneyAmount } from "@/components/domain/money-amount";
import CardDetailDialog from "./card-detail-dialog";
import { STAGE_CONFIG } from "./stage";
import type { PipelineCard } from "@/lib/services/ports";

export type PipelineCardCustomer = { id: string; name: string };

export type PipelineCardItemProps = {
  card: PipelineCard;
  customers: PipelineCardCustomer[];
};

export function PipelineCardItem({ card, customers }: PipelineCardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const [detailOpen, setDetailOpen] = useState(false);

  const customerName = card.customerId ? customers.find((customer) => customer.id === card.customerId)?.name : undefined;

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn("touch-none select-none", isDragging && "opacity-40")}
        {...attributes}
        {...listeners}
      >
        <Card size="sm" className="cursor-pointer" onClick={() => setDetailOpen(true)}>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">{card.title}</p>
            <Badge variant={STAGE_CONFIG[card.stage].variant}>{STAGE_CONFIG[card.stage].label}</Badge>
            {customerName ? <p className="text-xs text-muted-foreground">{customerName}</p> : null}
            {card.amount != null ? <MoneyAmount cents={card.amount} /> : null}
          </CardContent>
        </Card>
      </div>
      <CardDetailDialog open={detailOpen} onOpenChange={setDetailOpen} card={card} customers={customers} />
    </>
  );
}

/** The dragged card's visual twin, rendered inside `ventas-board.tsx`'s `<DragOverlay>` — static (no `useSortable`/dialog wiring, just the same markup). */
export function PipelineCardPreview({ card, customers }: PipelineCardItemProps) {
  const customerName = card.customerId ? customers.find((customer) => customer.id === card.customerId)?.name : undefined;

  return (
    <Card size="sm" className="shadow-lg">
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium">{card.title}</p>
        <Badge variant={STAGE_CONFIG[card.stage].variant}>{STAGE_CONFIG[card.stage].label}</Badge>
        {customerName ? <p className="text-xs text-muted-foreground">{customerName}</p> : null}
        {card.amount != null ? <MoneyAmount cents={card.amount} /> : null}
      </CardContent>
    </Card>
  );
}
