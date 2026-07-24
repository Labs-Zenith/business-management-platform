import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { PipelineCard } from "@/lib/services/ports";

/**
 * `ventas-board.tsx`. Two layers of coverage, per this change's test-plan
 * note ("you can invoke the drop handler directly rather than simulating
 * full pointer DnD"):
 *
 *  1. `moveCardWithinBoard`/`resolveTargetStage` — the pure drop-reducer
 *     functions — are unit-tested directly with plain data, no DOM/DnD
 *     involved at all.
 *  2. The rendered `<VentasBoard>` itself: `@dnd-kit/core`'s `DndContext`
 *     is mocked to a passthrough that captures the real `onDragEnd`/
 *     `onDragStart` callbacks the component wires up, so a "drop" can be
 *     simulated by calling the captured handler directly with a plain
 *     `{ active: { id }, over: { id } }` object — real pointer/keyboard
 *     event simulation isn't needed to exercise the optimistic-update +
 *     PATCH + revert-on-failure logic this file owns.
 */

const { capturedHandlers } = vi.hoisted(() => ({
  capturedHandlers: {} as { onDragEnd?: (event: DragEndEvent) => void; onDragStart?: (event: DragStartEvent) => void },
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragStart,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
      onDragStart?: (event: DragStartEvent) => void;
    }) => {
      capturedHandlers.onDragEnd = onDragEnd;
      capturedHandlers.onDragStart = onDragStart;
      return children;
    },
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Every `pipeline-card.tsx` unconditionally renders its (closed) detail
// dialog (`card-detail-dialog.tsx`, lazy `dynamic(ssr:false)` ->
// `card-detail-dialog-content.tsx`), which calls `useRouter()` as soon as it
// mounts regardless of `open` — so this needs mocking even though the board
// itself never calls `next/navigation`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { toast } from "sonner";
import VentasBoard, { moveCardWithinBoard, resolveTargetStage } from "./ventas-board";

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";

function makeCard(overrides: Partial<PipelineCard>): PipelineCard {
  return {
    id: "card-1",
    businessId: BUSINESS_ID,
    customerId: null,
    title: "Card",
    stage: "nuevo",
    amount: null,
    notes: null,
    position: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTargetStage", () => {
  const cards = [makeCard({ id: "a", stage: "nuevo" }), makeCard({ id: "b", stage: "interesado" })];

  it("returns the stage directly when overId is a column's own droppable id", () => {
    expect(resolveTargetStage(cards, "interesado")).toBe("interesado");
  });

  it("returns the stage of the card being hovered over when overId is a card id", () => {
    expect(resolveTargetStage(cards, "b")).toBe("interesado");
  });

  it("returns null when overId is null or matches nothing", () => {
    expect(resolveTargetStage(cards, null)).toBeNull();
    expect(resolveTargetStage(cards, "does-not-exist")).toBeNull();
  });
});

describe("moveCardWithinBoard", () => {
  it("moves a card into an empty stage (append) and sets position 0", () => {
    const cards = [makeCard({ id: "a", stage: "nuevo", position: 0 })];

    const result = moveCardWithinBoard(cards, "a", "interesado", "interesado");

    const moved = result.find((card) => card.id === "a")!;
    expect(moved.stage).toBe("interesado");
    expect(moved.position).toBe(0);
  });

  it("appends to the end of a non-empty target stage when overId is the column itself", () => {
    const cards = [
      makeCard({ id: "a", stage: "nuevo", position: 0 }),
      makeCard({ id: "b", stage: "interesado", position: 0 }),
      makeCard({ id: "c", stage: "interesado", position: 1 }),
    ];

    const result = moveCardWithinBoard(cards, "a", "interesado", "interesado");

    const stageOrder = result
      .filter((card) => card.stage === "interesado")
      .sort((x, y) => x.position - y.position)
      .map((card) => card.id);
    expect(stageOrder).toEqual(["b", "c", "a"]);
  });

  it("inserts before the hovered card and renumbers the target stage sequentially", () => {
    const cards = [
      makeCard({ id: "a", stage: "nuevo", position: 0 }),
      makeCard({ id: "b", stage: "interesado", position: 0 }),
      makeCard({ id: "c", stage: "interesado", position: 1 }),
    ];

    const result = moveCardWithinBoard(cards, "a", "interesado", "c");

    const stageOrder = result
      .filter((card) => card.stage === "interesado")
      .sort((x, y) => x.position - y.position)
      .map((card) => ({ id: card.id, position: card.position }));
    expect(stageOrder).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("reorders WITHIN the same stage without affecting other stages", () => {
    const cards = [
      makeCard({ id: "a", stage: "nuevo", position: 0 }),
      makeCard({ id: "b", stage: "nuevo", position: 1 }),
      makeCard({ id: "c", stage: "ganado", position: 0 }),
    ];

    const result = moveCardWithinBoard(cards, "b", "nuevo", "a");

    const stageOrder = result
      .filter((card) => card.stage === "nuevo")
      .sort((x, y) => x.position - y.position)
      .map((card) => card.id);
    expect(stageOrder).toEqual(["b", "a"]);
    expect(result.find((card) => card.id === "c")).toMatchObject({ stage: "ganado", position: 0 });
  });

  it("returns the same array reference-equal input untouched when activeId doesn't exist", () => {
    const cards = [makeCard({ id: "a" })];
    expect(moveCardWithinBoard(cards, "missing", "ganado", null)).toBe(cards);
  });
});

describe("<VentasBoard />", () => {
  const CUSTOMERS = [{ id: "cust-1", name: "Ana Gomez" }];

  beforeEach(() => {
    capturedHandlers.onDragEnd = undefined;
    capturedHandlers.onDragStart = undefined;
    vi.mocked(toast.error).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one column per STAGE_ORDER entry with the right cards and counts", () => {
    const cards = [
      makeCard({ id: "a", stage: "nuevo", title: "Lead A" }),
      makeCard({ id: "b", stage: "interesado", title: "Lead B" }),
      makeCard({ id: "c", stage: "interesado", title: "Lead C", position: 1 }),
    ];

    render(<VentasBoard initialCards={cards} customers={CUSTOMERS} />);

    expect(screen.getByTestId("ventas-column-nuevo")).toBeInTheDocument();
    expect(screen.getByTestId("ventas-column-interesado")).toBeInTheDocument();
    expect(screen.getByTestId("ventas-column-negociacion")).toBeInTheDocument();
    expect(screen.getByTestId("ventas-column-ganado")).toBeInTheDocument();
    expect(screen.getByTestId("ventas-column-perdido")).toBeInTheDocument();

    expect(within(screen.getByTestId("ventas-column-count-nuevo")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("ventas-column-count-interesado")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("ventas-column-count-ganado")).getByText("0")).toBeInTheDocument();

    expect(within(screen.getByTestId("ventas-column-nuevo")).getByText("Lead A")).toBeInTheDocument();
    expect(within(screen.getByTestId("ventas-column-interesado")).getByText("Lead B")).toBeInTheDocument();
    expect(within(screen.getByTestId("ventas-column-interesado")).getByText("Lead C")).toBeInTheDocument();
  });

  it("PATCHes the moved card's new stage/position on a successful drop", async () => {
    const cards = [makeCard({ id: "a", stage: "nuevo", position: 0 })];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<VentasBoard initialCards={cards} customers={CUSTOMERS} />);

    await act(async () => {
      capturedHandlers.onDragStart?.({ active: { id: "a" } } as DragStartEvent);
      await capturedHandlers.onDragEnd?.({ active: { id: "a" }, over: { id: "interesado" } } as DragEndEvent);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ventas/a",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({ stage: "interesado", position: 0 });
  });

  it("reverts the optimistic move and shows a toast when the PATCH fails", async () => {
    const cards = [makeCard({ id: "a", stage: "nuevo", position: 0 })];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    render(<VentasBoard initialCards={cards} customers={CUSTOMERS} />);

    await act(async () => {
      await capturedHandlers.onDragEnd?.({ active: { id: "a" }, over: { id: "interesado" } } as DragEndEvent);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    // Reverted: the card is back under "Nuevo", not "Interesado".
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("does not PATCH when dropped back in its original spot (no-op)", async () => {
    const cards = [makeCard({ id: "a", stage: "nuevo", position: 0 })];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<VentasBoard initialCards={cards} customers={CUSTOMERS} />);

    await act(async () => {
      await capturedHandlers.onDragEnd?.({ active: { id: "a" }, over: { id: "nuevo" } } as DragEndEvent);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a drop with no `over` target (dropped outside any column)", async () => {
    const cards = [makeCard({ id: "a", stage: "nuevo", position: 0 })];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<VentasBoard initialCards={cards} customers={CUSTOMERS} />);

    await act(async () => {
      await capturedHandlers.onDragEnd?.({ active: { id: "a" }, over: null } as unknown as DragEndEvent);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
