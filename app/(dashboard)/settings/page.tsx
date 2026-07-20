import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getBusinessProfile } from "@/lib/services/business-service";
import { canEditBusinessProfile } from "@/lib/services/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import BusinessProfileForm from "@/components/domain/settings/business-profile-form";

/**
 * Negocio / ajustes screen, per `docs/ui-ux-flow.md`,
 * `openspec/specs/business-profile/spec.md`, and
 * `docs/business-rules.md`'s "Negocios (Perfil y Cambio de Negocio)" section.
 *
 * Editable (Fase 5 Lane 2 — was read-only), now admin-only (security review
 * found `PATCH /api/business` had no role gate): this Server Component still
 * fetches the current profile server-side via `getBusinessProfile` (same
 * scoping as before), then hands it to the client `BusinessProfileForm`
 * along with `canEdit`, computed from `canEditBusinessProfile(session.role)`.
 * The form PATCHes `/api/business` on submit for admins; non-admins get a
 * read-only rendering (the authoritative gate is
 * `updateBusinessProfile`'s server-side check — this is UX, not security).
 * `requireSessionOrRedirect()` runs before any data fetch (defense in depth
 * alongside `middleware.ts`'s route guard on `/settings`); an unauthenticated
 * request never reaches `getBusinessProfile`.
 *
 * Fase 5.2 Wave 2 R2: this page previously had NO page-level header (unlike
 * every other dashboard screen) — added `PageHeader` (title "Configuración",
 * matching the renamed `/settings` nav item from Fase 5.2 F3) and swapped
 * the hand-rolled wrapper for `PageShell`. The admin/worker capability gate
 * above (`canEditBusinessProfile`) and its server-side enforcement in
 * `updateBusinessProfile` are unchanged by this purely visual pass.
 */
export default async function SettingsPage() {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const business = await getBusinessProfile(session);
  const canEdit = canEditBusinessProfile(session.role);

  return (
    <PageShell>
      <PageHeader title="Configuración" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Negocio</CardTitle>
          <CardDescription>Datos básicos de tu negocio.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            business={{
              name: business.name,
              phone: business.phone,
              email: business.email,
              address: business.address,
              currency: business.currency,
            }}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
