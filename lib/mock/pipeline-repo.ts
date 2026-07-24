import type {
  PipelineCard,
  PipelineCardCreate,
  PipelineCardListQuery,
  PipelineCardUpdate,
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

    async create(businessId: string, data: PipelineCardCreate): Promise<PipelineCard> {
      const now = new Date().toISOString();
      const card: PipelineCard = {
        id: generateId(),
        businessId,
        customerId: data.customerId ?? null,
        title: data.title,
        stage: data.stage,
        amount: data.amount ?? null,
        notes: data.notes ?? null,
        position: data.position ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      store.pipelineCards.set(card.id, card);
      return card;
    },

    async update(businessId: string, id: string, data: PipelineCardUpdate): Promise<PipelineCard | null> {
      const existing = store.pipelineCards.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }

      const updated: PipelineCard = {
        ...existing,
        ...data,
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
  };
}

export const pipelineRepo: PipelineRepository = createPipelineRepository(defaultStore);
