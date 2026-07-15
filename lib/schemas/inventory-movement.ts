/**
 * Inventory movement input schema, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s
 * "Inventory Movements Are Business-Scoped and Append-Only" and "Positive
 * Integer Movement Quantity" requirements.
 *
 * `.strict()` — any unknown field (including `businessId`/`id`/`createdAt`)
 * is rejected outright, matching `lib/schemas/payment.ts`'s/
 * `lib/schemas/expense.ts`'s established convention. `quantity` is REQUIRED
 * to be a positive integer — `.int()` enforces the spec's "Zero or negative
 * quantity rejected" scenario (also covers non-integer quantities), capped
 * at the same Postgres `INTEGER` upper bound as `lib/schemas/product.ts`'s
 * `unitCost` (the `inventory_movements.quantity` column is also `INTEGER`).
 * `note` is optional, matching Expense/Payment/PayrollPayment `notes`.
 * `typeId` (optional FK to `movement_types.id`, Wave 1A) is validated as a
 * uuid when present — the repository resolves it from `type`'s code when
 * omitted (no dropdown UI wires it yet).
 */

import { z } from "zod";
import { MAX_AMOUNT_COP_CENTS } from "./shared";

const NOTE_MAX = 1000;

/** Reuses `MAX_AMOUNT_COP_CENTS`'s underlying Postgres `INTEGER` bound for a
 * DIFFERENT reason than its name suggests: a movement `quantity` is a plain
 * unit count, not a currency amount — the shared constant is only reused
 * because `inventory_movements.quantity` is also an `INTEGER` column, same
 * numeric range, unrelated to money. */
const MAX_MOVEMENT_QUANTITY = MAX_AMOUNT_COP_CENTS;

export const inventoryMovementCreateSchema = z
  .object({
    productId: z.string().trim().min(1).uuid(),
    type: z.enum(["in", "out"]),
    quantity: z.number().int().positive().max(MAX_MOVEMENT_QUANTITY),
    note: z.string().trim().max(NOTE_MAX).nullable().optional(),
    typeId: z.string().trim().uuid().optional(),
  })
  .strict();

export type InventoryMovementCreateInput = z.infer<typeof inventoryMovementCreateSchema>;
