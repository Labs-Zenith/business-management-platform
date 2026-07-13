import { describe, expect, it } from "vitest";
import { invoiceCreateSchema, invoiceUpdateSchema } from "./invoice";

const VALID_PAYLOAD = {
  customerId: "40000000-0000-4000-8000-000000000001",
  issueDate: "2026-07-06",
  dueDate: "2026-07-20",
  items: [{ description: "Servicio de estetica", quantity: 1, unitPrice: 500000 }],
  notes: "Documento interno",
};

describe("invoiceCreateSchema", () => {
  it("accepts a valid full payload", () => {
    const result = invoiceCreateSchema.safeParse(VALID_PAYLOAD);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(VALID_PAYLOAD);
    }
  });

  it("accepts a minimal valid payload without dueDate/notes (dueDate optional)", () => {
    const result = invoiceCreateSchema.safeParse({
      customerId: VALID_PAYLOAD.customerId,
      issueDate: VALID_PAYLOAD.issueDate,
      items: VALID_PAYLOAD.items,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing customerId", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.customerId;
    const result = invoiceCreateSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing issueDate", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.issueDate;
    const result = invoiceCreateSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing items entirely", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.items;
    const result = invoiceCreateSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects an empty items array (at least one item required)", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, items: [] });

    expect(result.success).toBe(false);
  });

  it("rejects an item with quantity <= 0", () => {
    const result = invoiceCreateSchema.safeParse({
      ...VALID_PAYLOAD,
      items: [{ description: "Servicio", quantity: 0, unitPrice: 100000 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an item with a negative quantity", () => {
    const result = invoiceCreateSchema.safeParse({
      ...VALID_PAYLOAD,
      items: [{ description: "Servicio", quantity: -1, unitPrice: 100000 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an item with a negative unitPrice", () => {
    const result = invoiceCreateSchema.safeParse({
      ...VALID_PAYLOAD,
      items: [{ description: "Servicio", quantity: 1, unitPrice: -1 }],
    });

    expect(result.success).toBe(false);
  });

  it("accepts an item with unitPrice == 0", () => {
    const result = invoiceCreateSchema.safeParse({
      ...VALID_PAYLOAD,
      items: [{ description: "Cortesia", quantity: 1, unitPrice: 0 }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a client-supplied number via the strict schema", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, number: "FAC-9999" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied status via the strict schema", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, status: "paid" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied subtotal via the strict schema", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, subtotal: 999999 });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied total via the strict schema", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, total: 999999 });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied business_id via the strict schema", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, business_id: "hacked-business-id" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied line_total on an item via the strict per-item schema", () => {
    const result = invoiceCreateSchema.safeParse({
      ...VALID_PAYLOAD,
      items: [{ description: "Servicio", quantity: 1, unitPrice: 500000, lineTotal: 999999 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects any other unknown top-level field", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, createdAt: "2024-01-01T00:00:00.000Z" });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid issueDate string", () => {
    const result = invoiceCreateSchema.safeParse({ ...VALID_PAYLOAD, issueDate: "not-a-date" });

    expect(result.success).toBe(false);
  });
});

describe("invoiceUpdateSchema", () => {
  it("is the exact same schema object as invoiceCreateSchema (intentional alias, not an independently-maintained duplicate — locks in the decision so a future reader doesn't 're-fix' this by re-diverging them)", () => {
    expect(invoiceUpdateSchema).toBe(invoiceCreateSchema);
  });
});
