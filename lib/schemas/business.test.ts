import { describe, expect, it } from "vitest";
import { businessUpdateSchema } from "./business";

describe("businessUpdateSchema", () => {
  it("accepts a full valid payload with all editable fields", () => {
    const payload = {
      name: "Negocio Actualizado",
      phone: "3009999999",
      email: "contacto@negocio.test",
      address: "Cra 9 # 10-11",
      currency: "COP",
    };

    const result = businessUpdateSchema.safeParse(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
    }
  });

  it("accepts a partial update (name only)", () => {
    const result = businessUpdateSchema.safeParse({ name: "Nuevo Nombre" });

    expect(result.success).toBe(true);
  });

  it("accepts a partial update (currency only)", () => {
    const result = businessUpdateSchema.safeParse({ currency: "USD" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ currency: "USD" });
    }
  });

  it("rejects an empty payload (at least one field required)", () => {
    const result = businessUpdateSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects an empty-string name (min length 1)", () => {
    const result = businessUpdateSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a name exceeding the max length", () => {
    const result = businessUpdateSchema.safeParse({ name: "a".repeat(300) });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid email format", () => {
    const result = businessUpdateSchema.safeParse({ email: "not-an-email" });

    expect(result.success).toBe(false);
  });

  it("rejects a currency code that is not exactly 3 letters", () => {
    const result = businessUpdateSchema.safeParse({ currency: "US" });

    expect(result.success).toBe(false);
  });

  it("uppercases a lowercase currency code", () => {
    const result = businessUpdateSchema.safeParse({ currency: "cop" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("COP");
    }
  });

  it("rejects a client-supplied business_id (strict schema)", () => {
    const result = businessUpdateSchema.safeParse({ name: "Nuevo Nombre", business_id: "hacked-business-id" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied id (audit/identity field)", () => {
    const result = businessUpdateSchema.safeParse({ id: "hacked-id" });

    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied audit field", () => {
    const result = businessUpdateSchema.safeParse({ updatedAt: "2024-01-01T00:00:00.000Z" });

    expect(result.success).toBe(false);
  });
});
