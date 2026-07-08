/**
 * Builds the final OpenAPI 3 document from `lib/openapi/registry.ts`'s
 * definitions, per `design.md`'s "API / OpenAPI Layer" section:
 * "`document.ts` calls `OpenApiGeneratorV3(registry.definitions).
 * generateDocument(...)` -> OpenAPI 3 doc". Consumed by
 * `app/api/openapi.json/route.ts` (session-gated) and rendered by
 * `app/api/docs/page.tsx` (Scalar API Reference).
 *
 * Contains NO reference to `process.env` or any secret — the document is
 * built purely from static registry metadata, so there is nothing to leak.
 */

import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi/registry";

type OpenApiDocument = ReturnType<OpenApiGeneratorV3["generateDocument"]>;
type OpenApiDocumentConfig = Parameters<OpenApiGeneratorV3["generateDocument"]>[0];

const documentConfig: OpenApiDocumentConfig = {
  openapi: "3.0.0",
  info: {
    title: "Business Management Platform API",
    version: "0.1.0",
    description:
      "Mocked MVP API surface (auth, customers, invoices, payments, dashboard) — generated directly from " +
      "the same Zod schemas (lib/schemas/{customer,invoice,payment}.ts) used at runtime for request " +
      "validation, so this document cannot drift from actual validation behavior.",
  },
};

/** Generates a fresh OpenAPI 3 document on every call (cheap, no I/O). */
export function generateOpenApiDocument(): OpenApiDocument {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument(documentConfig);
}
