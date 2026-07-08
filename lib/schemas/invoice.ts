/**
 * Invoice input schema, per
 * `openspec/changes/mocked-mvp-scaffold/specs/invoices/spec.md` and
 * `docs/database-model.md`'s `invoices`/`invoice_items` tables.
 *
 * `.strict()` at both the top level and per-item level — any unknown field
 * (including `number`, `status`, `subtotal`, `total`, `business_id` at the
 * top level, or `lineTotal`/`line_total` inside an item) is rejected
 * outright rather than silently dropped, matching
 * `lib/schemas/customer.ts`'s established convention and `docs/api-spec.md`'s
 * "los schemas Zod deben ser estrictos para rechazar campos no permitidos".
 *
 * All amounts are integer minor units (COP cents) — see `lib/money.ts`.
 */

import { z } from "zod";

const DESCRIPTION_MAX = 300;
const NOTES_MAX = 1000;

const dateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date." });

const invoiceItemSchema = z
  .object({
    description: z.string().trim().min(1).max(DESCRIPTION_MAX),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })
  .strict();

export const invoiceCreateSchema = z
  .object({
    customerId: z.string().trim().min(1),
    issueDate: dateSchema,
    dueDate: dateSchema.optional(),
    items: z.array(invoiceItemSchema).min(1),
    notes: z.string().trim().max(NOTES_MAX).optional(),
  })
  .strict();

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
