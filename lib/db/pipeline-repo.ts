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
import { runTransaction, sql } from "./client";

/**
 * Mirrors `db/employee-repo.ts`'s strategy: fetch business-scoped rows via a
 * simple parameterized query, filter/sort in JS, no pagination (see
 * `PipelineRepository`'s doc comment — a pipeline is bounded). Unlike
 * Employee, cards ARE deletable.
 */

type PipelineCardRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  title: string;
  stage: string;
  amount: number | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

function toPipelineCard(row: PipelineCardRow): PipelineCard {
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    title: row.title,
    stage: row.stage as PipelineStage,
    amount: row.amount === null ? null : Number(row.amount),
    notes: row.notes,
    position: row.position,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

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
 * current MAX (0 for an empty stage). Used by BOTH `create` (Fix 3: a new
 * card must never collide with position 0 of a non-empty stage) and `update`
 * (Fix 4: moving a card to a different stage via the detail dialog, without
 * an explicit `position`, must append rather than keep the old stage's
 * position value).
 */
async function nextPositionInStage(businessId: string, stage: PipelineStage): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_position
    FROM pipeline_cards WHERE business_id = ${businessId} AND stage = ${stage}
  `) as unknown as { next_position: number }[];
  return Number(rows[0]!.next_position);
}

export const pipelineRepo: PipelineRepository = {
  async list(businessId: string, query?: PipelineCardListQuery): Promise<PipelineCard[]> {
    const rows = (await sql`
      SELECT * FROM pipeline_cards WHERE business_id = ${businessId}
    `) as unknown as PipelineCardRow[];
    let cards = rows.map(toPipelineCard);

    if (query?.stage) {
      cards = cards.filter((c) => c.stage === query.stage);
    }

    return sortCards(cards);
  },

  async getById(businessId: string, id: string): Promise<PipelineCard | null> {
    const rows = (await sql`SELECT * FROM pipeline_cards WHERE id = ${id}`) as unknown as PipelineCardRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return toPipelineCard(row);
  },

  /**
   * Fix 3: `data.position` undefined means "append" (server-authoritative),
   * NEVER a hardcoded `0` — a hardcoded default collided with an existing
   * card already at position 0 of a non-empty stage, producing duplicate
   * positions on the very first drag reorder.
   */
  async create(businessId: string, data: PipelineCardCreate): Promise<PipelineCard> {
    const position = data.position ?? (await nextPositionInStage(businessId, data.stage));

    const rows = (await sql`
      INSERT INTO pipeline_cards (
        id, business_id, customer_id, title, stage, amount, notes, position
      )
      VALUES (
        gen_random_uuid(), ${businessId}, ${data.customerId ?? null}, ${data.title}, ${data.stage},
        ${data.amount ?? null}, ${data.notes ?? null}, ${position}
      )
      RETURNING *
    `) as unknown as PipelineCardRow[];
    return toPipelineCard(rows[0]!);
  },

  /**
   * Fix 4: an edit that changes `stage` WITHOUT an explicit `position` (e.g.
   * the detail dialog's stage `<Select>`) appends to the destination stage
   * rather than silently keeping the old stage's position value — which
   * previously could either collide with an existing card at that position
   * in the new stage, or leave the card buried mid-column instead of at the
   * end. A drag (which always sends an explicit `position` via `reorder`) is
   * unaffected by this rule.
   */
  async update(businessId: string, id: string, data: PipelineCardUpdate): Promise<PipelineCard | null> {
    const existingRows = (await sql`SELECT * FROM pipeline_cards WHERE id = ${id}`) as unknown as PipelineCardRow[];
    const existing = existingRows[0];
    if (!existing || existing.business_id !== businessId) return null;

    const existingCard = toPipelineCard(existing);
    const isStageChange = data.stage !== undefined && data.stage !== existingCard.stage;
    const position =
      data.position ?? (isStageChange ? await nextPositionInStage(businessId, data.stage!) : existingCard.position);

    const merged = { ...existingCard, ...data, position };
    const rows = (await sql`
      UPDATE pipeline_cards SET
        customer_id = ${merged.customerId},
        title = ${merged.title},
        stage = ${merged.stage},
        amount = ${merged.amount},
        notes = ${merged.notes},
        position = ${merged.position},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `) as unknown as PipelineCardRow[];
    return toPipelineCard(rows[0]!);
  },

  async delete(businessId: string, id: string): Promise<boolean> {
    const existingRows = (await sql`SELECT * FROM pipeline_cards WHERE id = ${id}`) as unknown as PipelineCardRow[];
    const existing = existingRows[0];
    if (!existing || existing.business_id !== businessId) return false;

    await sql`DELETE FROM pipeline_cards WHERE id = ${id}`;
    return true;
  },

  /**
   * Fix 1 (the BLOCKER): a single-card PATCH on drag only ever persisted the
   * MOVED card's own `{stage, position}` — every SIBLING's client-recomputed
   * position was discarded, so a reload showed duplicate positions within a
   * stage. This bulk `reorder` persists the FULL renumbered set the board
   * sends (every card in every affected stage) atomically, in ONE
   * `runTransaction` — either all of it lands, or none of it does.
   *
   * Business-scoped per-item (not a single bulk `WHERE id IN (...)`): each
   * `UPDATE` carries its own `AND business_id = ${businessId}` guard, so an
   * id that doesn't belong to this business is silently a 0-row no-op rather
   * than a cross-business write — matching every other repository method's
   * scoping convention.
   */
  async reorder(businessId: string, items: PipelineReorderItem[]): Promise<void> {
    await runTransaction(async (tx) => {
      for (const item of items) {
        await tx`
          UPDATE pipeline_cards SET
            stage = ${item.stage},
            position = ${item.position},
            updated_at = now()
          WHERE id = ${item.id} AND business_id = ${businessId}
        `;
      }
    });
  },
};
