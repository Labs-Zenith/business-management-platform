"use client";

/**
 * Actual Scalar API Reference rendering. Always imported indirectly through
 * `./api-reference-client.tsx` (`dynamic(..., {ssr:false})`) — never import
 * this file directly from a page, matching the same lazy-loading pattern
 * established by `components/domain/customers/customer-form-dialog.tsx` /
 * `components/domain/invoices/invoice-form.tsx`.
 *
 * Renders `@scalar/api-reference-react`, pointed at `/api/openapi.json` —
 * the substitution for Swagger UI per `design.md`'s "Docs renderer" decision
 * (Scalar chosen over `swagger-ui-react` to avoid a React 19 peer-dependency
 * conflict; see `docs/technical-architecture.md` for the documented
 * substitution).
 */

import { ApiReferenceReact } from "@scalar/api-reference-react";

export default function ApiReferenceContent() {
  return (
    <ApiReferenceReact
      configuration={{
        url: "/api/openapi.json",
      }}
    />
  );
}
