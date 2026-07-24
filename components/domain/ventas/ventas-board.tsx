"use client";

/**
 * Client-side Ventas kanban board — one column per `STAGE_ORDER` entry
 * (`stage.ts`), each a vertically-sortable `@dnd-kit/sortable` list of
 * `pipeline-card.tsx` cards, with cross-column drag-and-drop.
 *
 * DND APPROACH (dnd-kit's official "multiple containers" pattern): each
 * column is BOTH (a) a `useDroppable` target whose `id` is the `PipelineStage`
 * itself — this is what makes dropping into an otherwise-EMPTY column (or
 * past the last card) register at all — and (b) a `SortableContext` wrapping
 * that stage's card ids, which is what gives WITHIN-column reordering (drag
 * over another card) via `useSortable` inside each `pipeline-card.tsx`. A
 * `DragOverlay` renders `PipelineCardPreview` (a static, non-sortable twin)
 * as the dragged card's visual "ghost", while the source card dims via its
 * own `isDragging` (see `pipeline-card.tsx`).
 *
 * `PointerSensor`'s `activationConstraint: { distance: 8 }` is what lets a
 * plain click on a card open its detail dialog instead of being swallowed as
 * a (zero-distance) drag — see `pipeline-card.tsx`'s doc comment.
 * `KeyboardSensor` + `sortableKeyboardCoordinates` give keyboard/screen-reader
 * users the same reordering capability (Tab to a card, Space to pick up,
 * arrow keys to move, Space to drop) per dnd-kit's built-in accessibility
 * story — no extra work needed here beyond wiring the sensor.
 *
 * MOVE PERSISTENCE (Fix 1 — bulk, server-authoritative reorder):
 * `handleDragEnd` computes the new `{stage, position}` for EVERY card in the
 * AFFECTED stage(s) PURELY from local state (`moveCardWithinBoard`, exported
 * for direct unit testing without simulating real pointer/keyboard drag
 * events — per this change's test-plan note), applies it OPTIMISTICALLY via
 * `setCards`, then `POST`s the FULL renumbered set to `/api/ventas/reorder`
 * — NOT a single-card `PATCH` (which previously discarded every sibling's
 * recomputed position, producing duplicate positions within a stage on
 * reload). "Affected stage(s)" is the target stage alone for a same-stage
 * reorder, or BOTH the source and target stages for a cross-stage move (the
 * source stage's remaining cards are renumbered too, closing the gap left by
 * the moved card — see `moveCardWithinBoard`'s doc comment). A failed
 * request reverts to the pre-drag snapshot and surfaces a `sonner`
 * `toast.error` (mounted globally by `app/layout.tsx`) — the user sees the
 * cards visually snap back with an explanation, rather than a silent desync
 * between the board and the server. A drop that doesn't actually change
 * `{stage, position}` (e.g. dropped back in its original spot), OR a
 * drop-on-self (Fix 2 — `active.id === over.id`, previously reordered
 * instead of no-op'ing), skips the network call entirely.
 */

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PipelineCardItem, PipelineCardPreview, type PipelineCardCustomer } from "./pipeline-card";
import { STAGE_CONFIG, STAGE_ORDER } from "./stage";
import type { PipelineCard, PipelineStage } from "@/lib/services/ports";

const DRAG_ERROR_MESSAGE = "No se pudo mover la card. Intenta de nuevo.";

export type VentasBoardCustomer = PipelineCardCustomer;

export type VentasBoardProps = {
  initialCards: PipelineCard[];
  customers: VentasBoardCustomer[];
};

/** `overId` is either a column's own droppable id (a `PipelineStage`) or another card's id — resolves either shape down to the target stage. */
export function resolveTargetStage(cards: PipelineCard[], overId: string | null): PipelineStage | null {
  if (!overId) return null;
  if ((STAGE_ORDER as readonly string[]).includes(overId)) return overId as PipelineStage;
  return cards.find((card) => card.id === overId)?.stage ?? null;
}

/**
 * Pure reducer: moves `activeId` into `targetStage`, positioned relative to
 * `overId` (another card's id — inserted just before it — or the target
 * stage's own droppable id / `null`, meaning "append at the end"), and
 * recomputes sequential `0..n-1` `position` values for every card left in
 * `targetStage`. When the move is CROSS-stage (the card's original stage
 * differs from `targetStage`), the SOURCE stage's remaining cards are ALSO
 * renumbered sequentially (Fix 1 support — closes the gap left by the moved
 * card, so the bulk `/api/ventas/reorder` payload built from this result
 * carries a correct, gapless `0..n-1` sequence for BOTH affected stages).
 * Every OTHER stage (neither source nor target) is left completely
 * untouched. Fix 2: a drop-on-self (`activeId === overId`) is a true no-op —
 * returns `cards` unchanged, reference-equal, before any other logic runs.
 * Exported so `ventas-board.test.tsx` can exercise the drop logic directly
 * without simulating a real pointer drag.
 */
export function moveCardWithinBoard(
  cards: PipelineCard[],
  activeId: string,
  targetStage: PipelineStage,
  overId: string | null,
): PipelineCard[] {
  if (activeId === overId) return cards;

  const active = cards.find((card) => card.id === activeId);
  if (!active) return cards;

  const sourceStage = active.stage;
  const withoutActive = cards.filter((card) => card.id !== activeId);
  const targetStageCards = withoutActive.filter((card) => card.stage === targetStage).sort((a, b) => a.position - b.position);
  const untouchedCards = withoutActive.filter((card) => card.stage !== targetStage && card.stage !== sourceStage);

  let insertIndex = targetStageCards.length;
  if (overId && overId !== targetStage) {
    const idx = targetStageCards.findIndex((card) => card.id === overId);
    if (idx !== -1) insertIndex = idx;
  }

  const reordered = [...targetStageCards.slice(0, insertIndex), active, ...targetStageCards.slice(insertIndex)];
  const withTargetPositions = reordered.map((card, index) => ({ ...card, stage: targetStage, position: index }));

  if (sourceStage === targetStage) {
    return [...untouchedCards, ...withTargetPositions];
  }

  const withSourcePositions = withoutActive
    .filter((card) => card.stage === sourceStage)
    .sort((a, b) => a.position - b.position)
    .map((card, index) => ({ ...card, position: index }));

  return [...untouchedCards, ...withSourcePositions, ...withTargetPositions];
}

function VentasColumn({
  stage,
  cards,
  customers,
}: {
  stage: PipelineStage;
  cards: PipelineCard[];
  customers: VentasBoardCustomer[];
}) {
  const { setNodeRef } = useDroppable({ id: stage });
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3" data-testid={`ventas-column-${stage}`}>
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium">{STAGE_CONFIG[stage].label}</span>
        <Badge variant="outline" data-testid={`ventas-column-count-${stage}`}>
          {cards.length}
        </Badge>
      </div>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 rounded-lg border border-dashed border-border p-2">
        <SortableContext id={stage} items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <PipelineCardItem key={card.id} card={card} customers={customers} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function VentasBoard({ initialCards, customers }: VentasBoardProps) {
  const [cards, setCards] = useState<PipelineCard[]>(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage,
        // Fix 5: `createdAt` tiebreak matches the repos' `sortCards` — keeps
        // client render order deterministic when two cards share a
        // `position` (e.g. between an optimistic update and the server's
        // authoritative re-render).
        cards: cards
          .filter((card) => card.stage === stage)
          .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
      })),
    [cards],
  );

  const activeCard = activeId ? (cards.find((card) => card.id === activeId) ?? null) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    // Fix 2: no drop target, or dropped on itself, is a true no-op — no
    // state change, no request.
    if (!over) return;
    if (String(active.id) === String(over.id)) return;

    const activeCardBeforeMove = cards.find((card) => card.id === active.id);
    if (!activeCardBeforeMove) return;

    const targetStage = resolveTargetStage(cards, String(over.id));
    if (!targetStage) return;

    const previousCards = cards;
    const nextCards = moveCardWithinBoard(cards, String(active.id), targetStage, String(over.id));
    if (nextCards === previousCards) return;

    const movedCard = nextCards.find((card) => card.id === active.id);
    if (!movedCard) return;
    if (movedCard.stage === activeCardBeforeMove.stage && movedCard.position === activeCardBeforeMove.position) {
      return;
    }

    setCards(nextCards);

    // Fix 1: send the FULL renumbered position set for every card in every
    // AFFECTED stage (source + target when they differ; just the target for
    // a same-stage reorder) — not just the single moved card — so siblings'
    // recomputed positions are persisted atomically instead of being
    // silently discarded.
    const affectedStages = new Set<PipelineStage>([targetStage, activeCardBeforeMove.stage]);
    const items = nextCards
      .filter((card) => affectedStages.has(card.stage))
      .map((card) => ({ id: card.id, stage: card.stage, position: card.position }));

    try {
      const response = await fetch("/api/ventas/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        throw new Error("Request failed");
      }
    } catch {
      setCards(previousCards);
      toast.error(DRAG_ERROR_MESSAGE);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {columns.map(({ stage, cards: stageCards }) => (
          <VentasColumn key={stage} stage={stage} cards={stageCards} customers={customers} />
        ))}
      </div>
      <DragOverlay>{activeCard ? <PipelineCardPreview card={activeCard} customers={customers} /> : null}</DragOverlay>
    </DndContext>
  );
}
