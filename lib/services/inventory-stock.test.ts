import { describe, expect, it } from "vitest";
import { computeProductStock } from "./inventory-stock";

/**
 * Single source of truth for the low-stock boundary math — both
 * `lib/mock/product-repo.test.ts` and `lib/db/product-repo.test.ts` rely on
 * this coverage instead of re-testing the comparison themselves (see their
 * thinner integration-level assertions).
 */

const PRODUCT = { unitCost: 1000, minStockThreshold: 10 };

describe("computeProductStock", () => {
  it("nets a mix of in/out movements to the correct currentQuantity and totalValue", () => {
    const result = computeProductStock(
      { unitCost: 1000, minStockThreshold: 0 },
      [
        { type: "in", quantity: 10 },
        { type: "in", quantity: 5 },
        { type: "in", quantity: 3 },
        { type: "out", quantity: 4 },
        { type: "out", quantity: 2 },
      ],
    );

    // 10 + 5 + 3 - 4 - 2 = 12
    expect(result.currentQuantity).toBe(12);
    expect(result.totalValue).toBe(12 * 1000);
  });

  it("computes currentQuantity 0 and totalValue 0 with no movements", () => {
    const result = computeProductStock(PRODUCT, []);

    expect(result.currentQuantity).toBe(0);
    expect(result.totalValue).toBe(0);
  });

  it("flags isLowStock=false exactly AT the threshold boundary", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 10 }]);

    expect(result.currentQuantity).toBe(10);
    expect(result.isLowStock).toBe(false);
  });

  it("flags isLowStock=true ONE below the threshold boundary", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 9 }]);

    expect(result.currentQuantity).toBe(9);
    expect(result.isLowStock).toBe(true);
  });

  it("flags isLowStock=false ONE above the threshold boundary", () => {
    const result = computeProductStock(PRODUCT, [{ type: "in", quantity: 11 }]);

    expect(result.currentQuantity).toBe(11);
    expect(result.isLowStock).toBe(false);
  });
});
