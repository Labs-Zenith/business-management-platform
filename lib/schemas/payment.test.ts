import { describe, expect, it } from "vitest";
import { paymentCreateSchema } from "./payment";

const VALID_PAYLOAD = {
  paymentDate: "2026-07-08",
  amount: 200000,
  method: "cash",
  notes: "Pago parcial",
};

describe("paymentCreateSchema", () => {
  it("accepts a valid full payload", () => {
    const result = paymentCreateSchema.safeParse(VALID_PAYLOAD);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(VALID_PAYLOAD);
    }
  });

  it("accepts a minimal valid payload without method/notes (both optional)", () => {
    const result = paymentCreateSchema.safeParse({
      paymentDate: VALID_PAYLOAD.paymentDate,
      amount: VALID_PAYLOAD.amount,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing amount", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.amount;
    const result = paymentCreateSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing paymentDate", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.paymentDate;
    const result = paymentCreateSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects amount == 0 (must be greater than zero)", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, amount: -1 });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid paymentDate string", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, paymentDate: "not-a-date" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied customerId via the strict schema", () => {
    const result = paymentCreateSchema.safeParse({
      ...VALID_PAYLOAD,
      customerId: "40000000-0000-4000-8000-000000000099",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied business_id via the strict schema", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, business_id: "hacked-business-id" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied status via the strict schema", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, status: "paid" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied balance via the strict schema", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, balance: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects any other unknown top-level field", () => {
    const result = paymentCreateSchema.safeParse({ ...VALID_PAYLOAD, invoiceId: "hacked" });

    expect(result.success).toBe(false);
  });
});
