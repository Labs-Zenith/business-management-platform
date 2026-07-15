import "@/lib/zod-locale";
/**
 * Payment input schema, per
 * `openspec/changes/mocked-mvp-scaffold/specs/payments/spec.md` and
 * `docs/database-model.md`'s `payments` table.
 *
 * `.strict()` — any unknown field (including `customerId`, `business_id`,
 * `status`, `balance`, `invoiceId`) is rejected outright rather than
 * silently dropped, matching `lib/schemas/invoice.ts`'s and
 * `lib/schemas/customer.ts`'s established convention. `customerId` is
 * intentionally NOT part of this schema at all — the invoice's own customer
 * is the ONLY source (`lib/services/payment-service.ts` /
 * `lib/mock/payment-repo.ts`), never a client-supplied value; `invoiceId`
 * comes from the URL path (`app/api/invoices/[id]/payments/route.ts`), not
 * the body.
 *
 * `amount` is an integer minor unit (COP cents) — see `lib/money.ts`.
 *
 * `methodId` (optional FK to `payment_methods.id`, Wave 1A) is validated as a
 * uuid when present — the repository resolves it from `method`'s code when
 * omitted (no dropdown UI wires it yet).
 */

import { z } from "zod";

const METHOD_MAX = 100;
const NOTES_MAX = 1000;

const dateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date." });

export const paymentCreateSchema = z
  .object({
    paymentDate: dateSchema,
    amount: z.number().positive(),
    method: z.string().trim().min(1).max(METHOD_MAX).optional(),
    notes: z.string().trim().max(NOTES_MAX).optional(),
    methodId: z.string().trim().uuid().optional(),
  })
  .strict();

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
