import type {
  PipelineCard,
  PipelineCardCreate,
  PipelineCardListQuery,
  PipelineCardUpdate,
  PipelineReorderItem,
  PipelineRepository,
  PipelineStage,
} from "@/lib/services/ports";
import { PIPELINE_STAGES } from "@/lib/services/ports";
import { generateId, store as defaultStore, type MockStore } from "./store";

/**
 * Mirrors `employee-repo.ts`'s structure closely — pipeline cards are
 * business-scoped and editable (list/getById/create/update), but UNLIKE
 * Employee, cards ARE deletable (`delete`). `list` returns every card for the
 * business, no pagination (see `PipelineRepository`'s doc comment).
 */

function stageOrder(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

function sortCards(cards: PipelineCard[]): PipelineCard[] {
  return [...cards].sort((a, b) => {
    const stageDiff = stageOrder(a.stage) - stageOrder(b.stage);
    if (stageDiff !== 0) return stageDiff;
    const positionDiff = a.position - b.position;
    if (positionDiff !== 0) return positionDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Server-authoritative "append" position for a business+stage — one past the
 * current MAX (0 for an empty stage). Mirrors `lib/db/pipeline-repo.ts`'s
 * `nextPositionInStage` exactly (Fix 3 for `create`, Fix 4 for `update`).
 */
function nextPositionInStage(store: MockStore, businessId: string, stage: PipelineStage): number {
  const positions = [...store.pipelineCards.values()]
    .filter((card) => card.businessId === businessId && card.stage === stage)
    .map((card) => card.position);
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

export function createPipelineRepository(store: MockStore): PipelineRepository {
  return {
    async list(businessId: string, query?: PipelineCardListQuery): Promise<PipelineCard[]> {
      let cards = [...store.pipelineCards.values()].filter((card) => card.businessId === businessId);

      if (query?.stage) {
        cards = cards.filter((card) => card.stage === query.stage);
      }

      return sortCards(cards);
    },

    async getById(businessId: string, id: string): Promise<PipelineCard | null> {
      const card = store.pipelineCards.get(id);
      if (!card || card.businessId !== businessId) {
        return null;
      }
      return card;
    },

    /**
     * Fix 3: `data.position` undefined means "append" (server-authoritative),
     * never a hardcoded `0` — a hardcoded default collided with an existing
     * card already at position 0 of a non-empty stage.
     */
    async create(businessId: string, data: PipelineCardCreate): Promise<PipelineCard> {
      const now = new Date().toISOString();
      const position = data.position ?? nextPositionInStage(store, businessId, data.stage);
      const card: PipelineCard = {
        id: generateId(),
        businessId,
        customerId: data.customerId ?? null,
        title: data.title,
        stage: data.stage,
        amount: data.amount ?? null,
        notes: data.notes ?? null,
        position,
        createdAt: now,
        updatedAt: now,
      };
      store.pipelineCards.set(card.id, card);
      return card;
    },

    /**
     * Fix 4: an edit that changes `stage` WITHOUT an explicit `position`
     * appends to the destination stage rather than keeping the old stage's
     * position value — see `lib/db/pipeline-repo.ts#update`'s matching doc
     * comment.
     */
    async update(businessId: string, id: string, data: PipelineCardUpdate): Promise<PipelineCard | null> {
      const existing = store.pipelineCards.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }

      const isStageChange = data.stage !== undefined && data.stage !== existing.stage;
      const position =
        data.position ?? (isStageChange ? nextPositionInStage(store, businessId, data.stage!) : existing.position);

      const updated: PipelineCard = {
        ...existing,
        ...data,
        position,
        updatedAt: new Date().toISOString(),
      };
      store.pipelineCards.set(id, updated);
      return updated;
    },

    async delete(businessId: string, id: string): Promise<boolean> {
      const existing = store.pipelineCards.get(id);
      if (!existing || existing.businessId !== businessId) {
        return false;
      }
      store.pipelineCards.delete(id);
      return true;
    },

    /**
     * Fix 1 (the BLOCKER): bulk, atomic (validate-then-apply) reorder — see
     * `lib/db/pipeline-repo.ts#reorder`'s doc comment for the full bug this
     * fixes. Business-scoped per item: an id belonging to a different
     * business (or missing entirely) is silently skipped, never touched.
     */
    async reorder(businessId: string, items: PipelineReorderItem[]): Promise<void> {
      const now = new Date().toISOString();
      const updates: Array<{ id: string; card: PipelineCard }> = [];

      for (const item of items) {
        const existing = store.pipelineCards.get(item.id);
        if (!existing || existing.businessId !== businessId) continue;
        updates.push({
          id: item.id,
          card: { ...existing, stage: item.stage, position: item.position, updatedAt: now },
        });
      }

      for (const { id, card } of updates) {
        store.pipelineCards.set(id, card);
      }
    },
  };
}

export const pipelineRepo: PipelineRepository = createPipelineRepository(defaultStore);
