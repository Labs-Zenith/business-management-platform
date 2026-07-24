import "@/lib/zod-locale";
/**
 * Pipeline (Ventas kanban) card input schemas. `.strict()` rejects any
 * unknown field (defense-in-depth against a forged `business_id`/`id`).
 * `amount` is integer minor units (COP cents) — see `lib/money.ts`. `stage`
 * is one of the fixed `PIPELINE_STAGES` (kanban columns).
 */
import { z } from "zod";
import { PIPELINE_STAGES } from "@/lib/services/ports";

const TITLE_MAX = 200;
const NOTES_MAX = 1000;

export const pipelineCardCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    stage: z.enum(PIPELINE_STAGES),
    customerId: z.string().uuid().nullable().optional(),
    amount: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();

export const pipelineCardUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    stage: z.enum(PIPELINE_STAGES).optional(),
    customerId: z.string().uuid().nullable().optional(),
    amount: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "El payload de actualización debe incluir al menos un campo.",
  });

export type PipelineCardCreateInput = z.infer<typeof pipelineCardCreateSchema>;
export type PipelineCardUpdateInput = z.infer<typeof pipelineCardUpdateSchema>;
