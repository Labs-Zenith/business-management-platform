import { describe, expect, it } from "vitest";
import { customerCreateSchema } from "@/lib/schemas/customer";
import { invoiceCreateSchema } from "@/lib/schemas/invoice";
import { paymentCreateSchema } from "@/lib/schemas/payment";
import { registry, schemas } from "@/lib/openapi/registry";

/**
 * Proves the registered request schemas are the REAL schemas from
 * `lib/schemas/*` (imported and registered, never re-declared) — per
 * `design.md`'s "Zod is the single source of truth -> spec cannot drift
 * from validation". Rather than asserting object identity (the underlying
 * library may attach metadata via a wrapper), every assertion below
 * exercises a validation RULE that only exists inside the original schema
 * file (a specific max length / min count / positivity constraint) and
 * would fail if `registry.ts` ever hand-rolled a simplified duplicate.
 */
describe("lib/openapi/registry", () => {
  it("registers CustomerCreate with the exact same validation rules as customerCreateSchema (NAME_MAX=200)", () => {
    const tooLongName = "a".repeat(201);

    expect(schemas.CustomerCreate.safeParse({ name: tooLongName }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ name: tooLongName }).success).toBe(false);

    expect(schemas.CustomerCreate.safeParse({ name: "Cliente valido" }).success).toBe(true);
  });

  it("registers CustomerCreate as .strict() — rejects an unknown/computed field like business_id", () => {
    const result = schemas.CustomerCreate.safeParse({ name: "Cliente", business_id: "hacked" });
    expect(result.success).toBe(false);
  });

  it("registers InvoiceCreate with the exact same item-count rule (min 1 item)", () => {
    const noItems = {
      customerId: "c1",
      issueDate: "2026-01-01",
      items: [],
    };

    expect(schemas.InvoiceCreate.safeParse(noItems).success).toBe(false);
    expect(invoiceCreateSchema.safeParse(noItems).success).toBe(false);
  });

  it("registers PaymentCreate with the exact same positivity rule (amount must be > 0)", () => {
    const negativeAmount = { paymentDate: "2026-01-01", amount: -5 };

    expect(schemas.PaymentCreate.safeParse(negativeAmount).success).toBe(false);
    expect(paymentCreateSchema.safeParse(negativeAmount).success).toBe(false);

    expect(schemas.PaymentCreate.safeParse({ paymentDate: "2026-01-01", amount: 5 }).success).toBe(true);
  });

  it("registers a cookie-based SessionCookie security scheme component", () => {
    const securityComponent = registry.definitions.find(
      (definition) => definition.type === "component" && definition.name === "SessionCookie",
    );

    expect(securityComponent).toBeDefined();
    expect(securityComponent).toMatchObject({
      type: "component",
      componentType: "securitySchemes",
      name: "SessionCookie",
      component: { type: "apiKey", in: "cookie" },
    });
  });
});
