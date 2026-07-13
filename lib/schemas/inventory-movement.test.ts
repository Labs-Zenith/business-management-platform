import { describe, expect, it } from "vitest";
import { inventoryMovementCreateSchema } from "./inventory-movement";

/**
 * Targeted test for the `quantity` upper-bound guard only (fix-pass scope —
 * see `lib/schemas/expense.test.ts` for the established pattern this
 * mirrors). Not a full schema test suite.
 */

const VALID_PAYLOAD = {
  productId: "90000000-0000-4000-8000-000000000001",
  type: "in" as const,
  quantity: 5,
};

describe("inventoryMovementCreateSchema — quantity upper bound", () => {
  it("accepts a quantity at the Postgres INTEGER upper bound", () => {
    const result = inventoryMovementCreateSchema.safeParse({ ...VALID_PAYLOAD, quantity: 2_147_483_647 });

    expect(result.success).toBe(true);
  });

  it("rejects a quantity exceeding the Postgres INTEGER upper bound", () => {
    const result = inventoryMovementCreateSchema.safeParse({ ...VALID_PAYLOAD, quantity: 2_147_483_648 });

    expect(result.success).toBe(false);
  });
});
