import type {
  PipelineCard,
  PipelineCardCreate,
  PipelineCardListQuery,
  PipelineCardUpdate,
  PipelineRepository,
  PipelineStage,
} from "@/lib/services/ports";
import { PIPELINE_STAGES } from "@/lib/services/ports";
import { sql } from "./client";

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

  async create(businessId: string, data: PipelineCardCreate): Promise<PipelineCard> {
    const rows = (await sql`
      INSERT INTO pipeline_cards (
        id, business_id, customer_id, title, stage, amount, notes, position
      )
      VALUES (
        gen_random_uuid(), ${businessId}, ${data.customerId ?? null}, ${data.title}, ${data.stage},
        ${data.amount ?? null}, ${data.notes ?? null}, ${data.position ?? 0}
      )
      RETURNING *
    `) as unknown as PipelineCardRow[];
    return toPipelineCard(rows[0]!);
  },

  async update(businessId: string, id: string, data: PipelineCardUpdate): Promise<PipelineCard | null> {
    const existingRows = (await sql`SELECT * FROM pipeline_cards WHERE id = ${id}`) as unknown as PipelineCardRow[];
    const existing = existingRows[0];
    if (!existing || existing.business_id !== businessId) return null;

    const merged = { ...toPipelineCard(existing), ...data };
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
};
