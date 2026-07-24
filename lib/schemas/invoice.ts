import "@/lib/zod-locale";
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
 *
 * `invoiceTypeId` (optional FK to `invoice_types.id`, Wave 1A) is validated
 * as a uuid when present — no type-picking UI wires it yet (Wave 2);
 * `invoice-service.ts#createInvoice` defaults it to the `venta` catalog type
 * when omitted.
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
    // Links the line to an inventory product (its stock is decremented on
    // create/update — see `lib/db/invoice-repo.ts`). `null`/omitted for a
    // free-text "Otro" line, which touches no inventory.
    productId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    // `inventory_movements.quantity` is `INTEGER NOT NULL CHECK(quantity>0)`,
    // but a plain `Otro`/free-text line never touches inventory, so ONLY a
    // product-linked line (`productId` a non-null string) must have an
    // integer `quantity` — a fractional value here would bind straight into
    // that INTEGER column and surface as a raw Postgres 500 instead of a
    // clean validation error. Free-text lines may stay fractional.
    if (item.productId != null && !Number.isInteger(item.quantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La cantidad debe ser un número entero para productos de inventario.",
        path: ["quantity"],
      });
    }
  });

export const invoiceCreateSchema = z
  .object({
    customerId: z.string().trim().min(1),
    issueDate: dateSchema,
    dueDate: dateSchema.optional(),
    items: z.array(invoiceItemSchema).min(1),
    notes: z.string().trim().max(NOTES_MAX).optional(),
    invoiceTypeId: z.string().trim().uuid().optional(),
  })
  .strict();

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

/**
 * `PATCH /api/invoices/{id}` payload, per
 * `openspec/changes/audit-log/design.md`'s "File Changes" and
 * `lib/services/ports.ts`'s `InvoiceUpdate` contract. `number` was never a
 * field on `invoiceCreateSchema` to begin with (it's always server-computed
 * and immutable, and `InvoiceUpdate` doesn't even have the field), so the
 * accepted input shape for create and update is genuinely identical —
 * `invoiceUpdateSchema` is intentionally the SAME schema object as
 * `invoiceCreateSchema`, not an independently-maintained duplicate. Keeping
 * them aliased (rather than two copies that happen to match today) means
 * `invoiceCreateSchema.test.ts`'s full boundary-condition coverage applies
 * to both by construction, and the two can never silently drift apart.
 */
export const invoiceUpdateSchema = invoiceCreateSchema;

export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
