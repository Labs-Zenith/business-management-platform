/**
 * Pipeline (Ventas kanban) service.
 *
 * Line-for-line analog of `employee-service.ts`: every function resolves
 * `businessId` from the `Session` argument ONLY — never from an id, a client
 * payload, or any other input. Cross-business access always surfaces as
 * `NOT_FOUND`, never leaking whether a differently-scoped record exists.
 * UNLIKE Employee, cards are deletable — `deletePipelineCard` throws
 * `NOT_FOUND` when nothing was deleted (missing id or cross-business).
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type {
  PipelineCard,
  PipelineCardCreate,
  PipelineCardListQuery,
  PipelineCardUpdate,
  PipelineReorderItem,
  Session,
} from "@/lib/services/ports";

export async function listPipelineCards(session: Session, query?: PipelineCardListQuery): Promise<PipelineCard[]> {
  return repositories.pipeline.list(session.businessId, query);
}

export async function getPipelineCard(session: Session, id: string): Promise<PipelineCard> {
  const card = await repositories.pipeline.getById(session.businessId, id);
  if (!card) {
    throw new ApiError("NOT_FOUND", "Pipeline card not found.");
  }
  return card;
}

export async function createPipelineCard(session: Session, data: PipelineCardCreate): Promise<PipelineCard> {
  return repositories.pipeline.create(session.businessId, data);
}

/**
 * Only title/stage/customerId/amount/notes/position are ever forwarded to the
 * repository — defense in depth on top of `lib/schemas/pipeline.ts`'s
 * `.strict()` schema: even if a caller somehow bypasses schema validation, a
 * forged `businessId`/audit field on `data` is stripped here before it ever
 * reaches the repository.
 */
export async function updatePipelineCard(
  session: Session,
  id: string,
  data: PipelineCardUpdate,
): Promise<PipelineCard> {
  const sanitized: PipelineCardUpdate = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.stage !== undefined && { stage: data.stage }),
    ...(data.customerId !== undefined && { customerId: data.customerId }),
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.position !== undefined && { position: data.position }),
  };

  const updated = await repositories.pipeline.update(session.businessId, id, sanitized);
  if (!updated) {
    throw new ApiError("NOT_FOUND", "Pipeline card not found.");
  }
  return updated;
}

export async function deletePipelineCard(session: Session, id: string): Promise<void> {
  const deleted = await repositories.pipeline.delete(session.businessId, id);
  if (!deleted) {
    throw new ApiError("NOT_FOUND", "Pipeline card not found.");
  }
}

/**
 * Bulk reorder (Fix 1 — the drag-and-drop position bug): `businessId` is
 * resolved from `session` ONLY, matching every other function in this file —
 * never trusted from the client payload. Cross-business ids are silently
 * skipped by the repository (see `PipelineRepository.reorder`'s doc
 * comment), never surfaced as an error, so a stale/forged id in the payload
 * can't reveal cross-business existence.
 */
export async function reorderPipelineCards(session: Session, items: PipelineReorderItem[]): Promise<void> {
  await repositories.pipeline.reorder(session.businessId, items);
}
