import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { generateOpenApiDocument } from "@/lib/openapi/document";

/**
 * `GET /api/openapi.json`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/api-docs/spec.md`'s "OpenAPI
 * Specification Endpoint" requirement and `docs/technical-architecture.md`'s
 * "en produccion beta, ambos endpoints de documentacion deben requerir
 * sesion autenticada y no deben exponer secretos" rule.
 *
 * `requireSession()` gates the response (401 UNAUTHENTICATED without a
 * valid session, same defense-in-depth pattern as every other protected
 * route); `withApiHandler` sets `Cache-Control: no-store` on every
 * response, matching the "No-Store Caching for Gated Docs" requirement.
 * The document itself (`lib/openapi/document.ts`) is generated purely from
 * static registry metadata — it never reads `process.env`, so there is
 * nothing to leak.
 */
export const GET = withApiHandler(async (): Promise<NextResponse> => {
  await requireSession();

  const document = generateOpenApiDocument();

  return NextResponse.json(document, { status: 200 });
});
