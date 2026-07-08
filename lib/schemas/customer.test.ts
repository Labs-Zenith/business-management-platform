import { describe, expect, it } from "vitest";
import { customerCreateSchema, customerUpdateSchema } from "./customer";

describe("customerCreateSchema", () => {
  it("accepts a minimal valid payload (name only)", () => {
    const result = customerCreateSchema.safeParse({ name: "Ana Gomez" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Ana Gomez" });
    }
  });

  it("accepts a full valid payload with all optional descriptive fields", () => {
    const payload = {
      name: "Ana Gomez",
      documentNumber: "1000000001",
      email: "ana.gomez@example.com",
      phone: "3001111111",
      address: "Cra 1 # 2-3",
      notes: "Cliente frecuente",
    };

    const result = customerCreateSchema.safeParse(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
    }
  });

  it("rejects a payload missing name (required)", () => {
    const result = customerCreateSchema.safeParse({ email: "ana.gomez@example.com" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied business_id via the strict schema", () => {
    const result = customerCreateSchema.safeParse({ name: "Ana Gomez", business_id: "hacked-business-id" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied isActive at creation (isActive always defaults true — not client-settable here)", () => {
    const result = customerCreateSchema.safeParse({ name: "Ana Gomez", isActive: false });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid email format", () => {
    const result = customerCreateSchema.safeParse({ name: "Ana Gomez", email: "not-an-email" });

    expect(result.success).toBe(false);
  });

  it("rejects a name exceeding the max length", () => {
    const result = customerCreateSchema.safeParse({ name: "a".repeat(300) });

    expect(result.success).toBe(false);
  });

  it("rejects any other unknown field", () => {
    const result = customerCreateSchema.safeParse({ name: "Ana Gomez", createdAt: "2024-01-01T00:00:00.000Z" });

    expect(result.success).toBe(false);
  });
});

describe("customerUpdateSchema", () => {
  it("accepts a partial descriptive update", () => {
    const result = customerUpdateSchema.safeParse({ phone: "3009999999" });

    expect(result.success).toBe(true);
  });

  it("accepts isActive alone", () => {
    const result = customerUpdateSchema.safeParse({ isActive: false });

    expect(result.success).toBe(true);
  });

  it("rejects a client-supplied business_id", () => {
    const result = customerUpdateSchema.safeParse({ name: "New Name", business_id: "hacked-business-id" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied balance/computed field", () => {
    const result = customerUpdateSchema.safeParse({ balance: 999999 });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied audit field", () => {
    const result = customerUpdateSchema.safeParse({ updatedAt: "2024-01-01T00:00:00.000Z" });

    expect(result.success).toBe(false);
  });

  it("rejects an empty payload", () => {
    const result = customerUpdateSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
