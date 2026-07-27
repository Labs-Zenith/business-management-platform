import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABELS, formatAuditAction } from "./action-labels";

describe("formatAuditAction", () => {
  it("maps every known action to its Spanish label", () => {
    expect(formatAuditAction("invoice_created")).toBe("Factura creada");
    expect(formatAuditAction("invoice_updated")).toBe("Factura actualizada");
    expect(formatAuditAction("payment_recorded")).toBe("Pago registrado");
    expect(formatAuditAction("quote_created")).toBe("Cotización creada");
    expect(formatAuditAction("quote_converted_to_invoice")).toBe("Cotización convertida a factura");
  });

  it("covers the whole label map (no entry renders raw)", () => {
    for (const [action, label] of Object.entries(AUDIT_ACTION_LABELS)) {
      expect(formatAuditAction(action)).toBe(label);
      expect(formatAuditAction(action)).not.toBe(action);
    }
  });

  it("prettifies an unknown/future action instead of leaving the raw enum", () => {
    expect(formatAuditAction("future_action")).toBe("Future action");
    expect(formatAuditAction("some_new_thing")).toBe("Some new thing");
  });

  it("returns the input unchanged when it cannot be prettified", () => {
    expect(formatAuditAction("")).toBe("");
  });
});
