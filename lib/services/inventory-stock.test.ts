import { describe, expect, it } from "vitest";
import {
  computeProductStock,
  CREDIT_NOTE_CODE,
  movementDirectionFor,
  reverseMovementDirection,
} from "./inventory-stock";

/**
 * Single source of truth for the low-stock boundary math — both
 * `lib/mock/product-repo.test.ts` and `lib/db/product-repo.test.ts` rely on
 * this coverage instead of re-testing the comparison themselves (see their
 * thinner integration-level assertions).
 *
 * LOW-STOCK RULE (Wave 1A): fixed business rule, `1 <= currentQuantity <= 3`
 * — no more per-product `minStockThreshold` (removed from `ProductStockInput`
 * entirely).
 */

const PRODUCT = { unitCost: 1000 };

describe("computeProductStock", () => {
  it("nets a mix of in/out movements to the correct currentQuantity and totalValue", () => {
    const result = computeProductStock(PRODUCT, [
      { type: "in", quantity: 10 },
      { type: "in", quantity: 5 },
      { type: "in", quantity: 3 },
      { type: "out", quantity: 4 },
      { type: "out", quantity: 2 },
    ]);

    // 10 + 5 + 3 - 4 - 2 = 12
    expect(result.currentQuantity).toBe(12);
    expect(result.totalValue).toBe(12 * 1000);
  });

  it("computes currentQuantity 0 and totalValue 0 with no movements, and is NOT low-stock at zero", () => {
    const result = computeProductStock(PRODUCT, []);

    expect(result.currentQuantity).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.isLowStock).toBe(false);
  });

  it("flags isLowStock=true at the lower boundary (currentQuantity == 1)", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 1 }]);

    expect(result.currentQuantity).toBe(1);
    expect(result.isLowStock).toBe(true);
  });

  it("flags isLowStock=true at the upper boundary (currentQuantity == 3)", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 3 }]);

    expect(result.currentQuantity).toBe(3);
    expect(result.isLowStock).toBe(true);
  });

  it("flags isLowStock=false ONE above the upper boundary (currentQuantity == 4)", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 4 }]);

    expect(result.currentQuantity).toBe(4);
    expect(result.isLowStock).toBe(false);
  });

  it("flags isLowStock=false at zero (out of stock is a distinct state, not low-stock)", () => {
    const result = computeProductStock(PRODUCT, [
      { type: "in", quantity: 5 },
      { type: "out", quantity: 5 },
    ]);

    expect(result.currentQuantity).toBe(0);
    expect(result.isLowStock).toBe(false);
  });

  it("flags isLowStock=true for currentQuantity == 2 (mid-range)", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 2 }]);

    expect(result.currentQuantity).toBe(2);
    expect(result.isLowStock).toBe(true);
  });
});

/**
 * Which way an invoice's lines move stock. A credit note is a RETURN, so it
 * is the ONE type that puts units back on the shelf — the direction is a
 * business rule shared by both invoice repos, which is why it lives here
 * rather than being hardcoded twice.
 */
describe("movementDirectionFor", () => {
  it("returns 'in' for a credit note — a return puts units back", () => {
    expect(movementDirectionFor("nota_credito")).toBe("in");
    expect(movementDirectionFor(CREDIT_NOTE_CODE)).toBe("in");
  });

  it("returns 'out' for a sale", () => {
    expect(movementDirectionFor("venta")).toBe("out");
  });

  it("returns 'out' for a debit note — it bills MORE, never less", () => {
    expect(movementDirectionFor("nota_debito")).toBe("out");
  });

  it("defaults to 'out' for an unknown, null or undefined code", () => {
    // Deny-by-default in the safe direction: an unrecognised type behaves
    // like a sale, which is the guarded path, rather than silently minting
    // stock out of nowhere.
    expect(movementDirectionFor("algo_nuevo")).toBe("out");
    expect(movementDirectionFor(null)).toBe("out");
    expect(movementDirectionFor(undefined)).toBe("out");
  });
});

describe("reverseMovementDirection", () => {
  it("mirrors the direction, so an edit undoes exactly what it applied", () => {
    expect(reverseMovementDirection("out")).toBe("in");
    expect(reverseMovementDirection("in")).toBe("out");
  });

  it("round-trips back to the original", () => {
    expect(reverseMovementDirection(reverseMovementDirection("out"))).toBe("out");
  });
});
