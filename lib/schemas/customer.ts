import "@/lib/zod-locale";
/**
 * Customer input schemas, per
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md` and
 * `docs/database-model.md`'s `customers` table.
 *
 * Both schemas are `.strict()` — any unknown field (including `business_id`,
 * balances, or audit fields like `created_at`/`updated_at`) is rejected
 * outright rather than silently dropped, per `docs/api-spec.md`'s "los
 * schemas Zod deben ser estrictos para rechazar campos no permitidos".
 *
 * `isActive` is intentionally NOT part of `customerCreateSchema` — a new
 * customer is always active by construction (`lib/mock/customer-repo.ts`
 * hardcodes `isActive: true` and ignores any input value); a client trying
 * to set it at creation time is treated the same as any other unknown/
 * computed field and rejected. `isActive` only becomes editable via
 * `customerUpdateSchema` (PATCH).
 */

import { z } from "zod";

const NAME_MAX = 200;
const DOCUMENT_NUMBER_MAX = 50;
const EMAIL_MAX = 254;
const PHONE_MAX = 30;
const ADDRESS_MAX = 300;
const NOTES_MAX = 1000;

const descriptiveFields = {
  name: z.string().trim().min(1).max(NAME_MAX),
  documentNumber: z.string().trim().min(1).max(DOCUMENT_NUMBER_MAX).optional(),
  email: z.string().trim().min(1).max(EMAIL_MAX).email().optional(),
  phone: z.string().trim().min(1).max(PHONE_MAX).optional(),
  address: z.string().trim().min(1).max(ADDRESS_MAX).optional(),
  notes: z.string().trim().max(NOTES_MAX).optional(),
};

export const customerCreateSchema = z
  .object({
    ...descriptiveFields,
  })
  .strict();

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = z
  .object({
    ...descriptiveFields,
    name: descriptiveFields.name.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Update payload must include at least one field.",
  });

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
