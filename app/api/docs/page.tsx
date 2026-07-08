import { requireSession } from "@/lib/session";
import ApiReferenceClient from "@/components/domain/docs/api-reference-client";

/**
 * `GET /api/docs`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/api-docs/spec.md`'s
 * "Interactive Docs UI via Scalar" requirement.
 *
 * `requireSession()` runs before anything renders (defense in depth, same
 * pattern as every other protected page — e.g. `settings/page.tsx`); the
 * actual redirect-to-`/login` for an unauthenticated *browser* request
 * happens at `middleware.ts` (which already lists `/api/docs` in
 * `PROTECTED_PATH_PREFIXES`/`matcher`), before this Server Component ever
 * runs.
 */
export default async function ApiDocsPage() {
  await requireSession();

  return <ApiReferenceClient />;
}
