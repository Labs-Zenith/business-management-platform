import { describe, expect, it } from "vitest";
import { expenseCreateSchema } from "./expense";

const VALID_PAYLOAD = {
  category: "otro" as const,
  expenseDate: "2026-07-08",
  description: "Papeleria",
  amount: 50000,
  notes: "Compra mensual",
};

describe("expenseCreateSchema", () => {
  it("accepts a valid full payload", () => {
    const result = expenseCreateSchema.safeParse(VALID_PAYLOAD);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(VALID_PAYLOAD);
    }
  });

  it("accepts a minimal valid payload without notes (optional)", () => {
    const result = expenseCreateSchema.safeParse({
      category: VALID_PAYLOAD.category,
      expenseDate: VALID_PAYLOAD.expenseDate,
      description: VALID_PAYLOAD.description,
      amount: VALID_PAYLOAD.amount,
    });

    expect(result.success).toBe(true);
  });

  it("accepts both valid categories", () => {
    expect(expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, category: "nomina" }).success).toBe(true);
    expect(expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, category: "otro" }).success).toBe(true);
  });

  it("rejects an invalid category value", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, category: "viajes" });

    expect(result.success).toBe(false);
  });

  it("rejects amount == 0", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: -1 });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer (fractional) amount", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: 100.5 });

    expect(result.success).toBe(false);
  });

  it("accepts an amount at the Postgres INTEGER upper bound", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: 2_147_483_647 });

    expect(result.success).toBe(true);
  });

  it("rejects an amount exceeding the Postgres INTEGER upper bound", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: 2_147_483_648 });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing description", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.description;
    const result = expenseCreateSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects an invalid expenseDate string", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, expenseDate: "not-a-date" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied business_id via the strict schema", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, business_id: "hacked-business-id" });

    expect(result.success).toBe(false);
  });

  it("rejects any other unknown top-level field", () => {
    const result = expenseCreateSchema.safeParse({ ...VALID_PAYLOAD, status: "approved" });

    expect(result.success).toBe(false);
  });
});
