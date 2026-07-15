import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function buildRequest(path: string, cookieValue?: string): NextRequest {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `session=${cookieValue}`);
  }
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("middleware", () => {
  it("redirects unauthenticated requests to a protected dashboard route to /login", async () => {
    const response = await middleware(buildRequest("/dashboard"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to a protected (print) invoice receipt route to /login", async () => {
    const response = await middleware(buildRequest("/invoices/some-id/receipt"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to a protected (print) payment receipt route to /login", async () => {
    const response = await middleware(buildRequest("/payments/some-id/receipt"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /api/docs to /login", async () => {
    const response = await middleware(buildRequest("/api/docs"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  /**
   * Nomina (payroll) additions — presence-only, per
   * `openspec/changes/nomina-payroll/design.md`'s Middleware section: role
   * is never checked here, only cookie presence. The authoritative
   * capability check lives at the page (`requireCapabilityOrNotFound`) and
   * route (`requireCapability`) layers.
   */
  it("redirects unauthenticated requests to the gated /nomina page to /login", async () => {
    const response = await middleware(buildRequest("/nomina"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /api/employees to /login", async () => {
    const response = await middleware(buildRequest("/api/employees"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /api/payroll-payments to /login", async () => {
    const response = await middleware(buildRequest("/api/payroll-payments"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("allows a request with a session cookie through to /nomina, /api/employees, and /api/payroll-payments (presence-only — role is never checked here)", async () => {
    for (const path of ["/nomina", "/api/employees", "/api/payroll-payments"]) {
      const response = await middleware(buildRequest(path, "opaque-token-value"));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  /**
   * Inventario (stock tracking) additions — presence-only, per
   * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No
   * Role Gating on Inventory" requirement: unlike Nomina, there is no role
   * check here OR at the page/route layer — any authenticated session may
   * proceed.
   */
  it("redirects unauthenticated requests to the /inventario page to /login", async () => {
    const response = await middleware(buildRequest("/inventario"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /api/products to /login", async () => {
    const response = await middleware(buildRequest("/api/products"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /api/inventory-movements to /login", async () => {
    const response = await middleware(buildRequest("/api/inventory-movements"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("allows a request with a session cookie through to /inventario, /api/products, and /api/inventory-movements", async () => {
    for (const path of ["/inventario", "/api/products", "/api/inventory-movements"]) {
      const response = await middleware(buildRequest(path, "opaque-token-value"));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("allows requests to a protected route through when a session cookie is present", async () => {
    const response = await middleware(buildRequest("/dashboard", "opaque-token-value"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect requests to public paths like /login", async () => {
    const response = await middleware(buildRequest("/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect requests to public auth API routes", async () => {
    const response = await middleware(buildRequest("/api/auth/login"));

    expect(response.headers.get("location")).toBeNull();
  });
});
