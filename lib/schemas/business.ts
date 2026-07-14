/**
 * Business-profile update schema, per `docs/business-rules.md`'s "Negocios
 * (Perfil y Cambio de Negocio)" section and mirroring
 * `lib/schemas/customer.ts`'s style (`.strict()`, at-least-one-field refine
 * on update).
 *
 * `.strict()` rejects any unknown field (including `business_id`, `id`, or
 * audit fields like `created_at`/`updated_at`) outright rather than silently
 * dropping it, per `docs/api-spec.md`'s "los schemas Zod deben ser
 * estrictos para rechazar campos no permitidos". `business_id` is never a
 * field a client can set through this schema — it always comes from the
 * session (see `lib/services/business-service.ts`'s `updateBusinessProfile`).
 */

import { z } from "zod";

const NAME_MAX = 200;
const EMAIL_MAX = 254;
const PHONE_MAX = 30;
const ADDRESS_MAX = 300;

/** ISO-4217-style 3-letter code, matching the existing "COP" convention (`lib/mock/fixtures/data.ts`, `lib/format/numeric-mask.ts`). */
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code (e.g. COP).");

export const businessUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    phone: z.string().trim().min(1).max(PHONE_MAX).optional(),
    email: z.string().trim().min(1).max(EMAIL_MAX).email().optional(),
    address: z.string().trim().min(1).max(ADDRESS_MAX).optional(),
    currency: currencySchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Update payload must include at least one field.",
  });

export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
