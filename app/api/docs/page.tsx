import { requireSessionOrRedirect } from "@/lib/session";
import ApiReferenceClient from "@/components/domain/docs/api-reference-client";

/**
 * `GET /api/docs`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/api-docs/spec.md`'s
 * "Interactive Docs UI via Scalar" requirement.
 *
 * `requireSessionOrRedirect()` runs before anything renders (defense in
 * depth, same pattern as every other protected page — e.g.
 * `settings/page.tsx`); it also redirects to `/login` itself for a stale/
 * invalid session cookie, in addition to `middleware.ts` (which already
 * lists `/api/docs` in `PROTECTED_PATH_PREFIXES`/`matcher`) catching the
 * no-cookie-at-all case before this Server Component ever runs.
 */
export default async function ApiDocsPage() {
  await requireSessionOrRedirect();

  return <ApiReferenceClient />;
}
