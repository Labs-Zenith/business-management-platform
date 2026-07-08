import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateOpenApiDocument } from "@/lib/openapi/document";

/**
 * Proves `document.ts` produces a genuine OpenAPI 3 document derived from
 * `lib/openapi/registry.ts` (which in turn imports the REAL
 * `lib/schemas/{customer,invoice,payment}.ts` schemas) — per the api-docs
 * spec's "OpenAPI Specification Endpoint" requirement: describes every
 * implemented endpoint (auth, customers, invoices, payments, dashboard),
 * excludes the descoped `/api/business`, and never leaks secrets.
 */
describe("lib/openapi/document#generateOpenApiDocument", () => {
  const ORIGINAL_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    // A secret-leak canary: if any code path accidentally interpolated an
    // env var into the document, this marker would appear in the output.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "leak-marker-should-never-appear-xyz789";
  });

  afterEach(() => {
    if (ORIGINAL_SERVICE_ROLE_KEY === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE_ROLE_KEY;
    }
  });

  it("is a valid OpenAPI 3 document shape", () => {
    const document = generateOpenApiDocument();

    expect(document.openapi).toBe("3.0.0");
    expect(document.info.title).toBeTruthy();
    expect(typeof document.paths).toBe("object");
  });

  it("describes every implemented endpoint (auth, customers, invoices, payments, dashboard)", () => {
    const document = generateOpenApiDocument();
    const paths = document.paths as Record<string, Record<string, unknown>>;

    expect(paths["/api/auth/login"]?.post).toBeDefined();
    expect(paths["/api/auth/logout"]?.post).toBeDefined();
    expect(paths["/api/customers"]?.get).toBeDefined();
    expect(paths["/api/customers"]?.post).toBeDefined();
    expect(paths["/api/customers/{id}"]?.get).toBeDefined();
    expect(paths["/api/customers/{id}"]?.patch).toBeDefined();
    expect(paths["/api/invoices"]?.get).toBeDefined();
    expect(paths["/api/invoices"]?.post).toBeDefined();
    expect(paths["/api/invoices/{id}"]?.get).toBeDefined();
    expect(paths["/api/invoices/{id}/payments"]?.post).toBeDefined();
    expect(paths["/api/payments"]?.get).toBeDefined();
    expect(paths["/api/dashboard/summary"]?.get).toBeDefined();
  });

  it("excludes the descoped /api/business endpoint", () => {
    const document = generateOpenApiDocument();
    const paths = document.paths as Record<string, unknown>;

    expect(paths["/api/business"]).toBeUndefined();
  });

  it("derives CustomerCreate's component schema from the REAL customerCreateSchema (.strict() -> additionalProperties:false, name required, documentNumber optional)", () => {
    const document = generateOpenApiDocument();
    const components = document.components as { schemas: Record<string, Record<string, unknown>> };

    const customerCreate = components.schemas.CustomerCreate;
    expect(customerCreate.additionalProperties).toBe(false);
    expect(customerCreate.required).toEqual(["name"]);
    expect(Object.keys(customerCreate.properties as object)).toContain("documentNumber");
  });

  it("declares a cookie-based session security scheme, applied to a private path", () => {
    const document = generateOpenApiDocument();
    const components = document.components as {
      securitySchemes: Record<string, { type: string; in: string }>;
    };
    const paths = document.paths as Record<string, Record<string, { security?: unknown[] }>>;

    expect(components.securitySchemes.SessionCookie).toMatchObject({ type: "apiKey", in: "cookie" });
    expect(paths["/api/customers"].get.security).toEqual([{ SessionCookie: [] }]);
  });

  it("never leaks a secret/env-var value anywhere in the generated document", () => {
    const document = generateOpenApiDocument();
    const serialized = JSON.stringify(document);

    expect(serialized).not.toContain("leak-marker-should-never-appear-xyz789");
    expect(serialized.toLowerCase()).not.toContain("service_role_key");
  });
});
