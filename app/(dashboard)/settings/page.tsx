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
 */
export default async function SettingsPage() {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const business = await getBusinessProfile(session);
  const canEdit = canEditBusinessProfile(session.role);

  return (
    <div className="flex flex-1 flex-col p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Negocio</CardTitle>
          <CardDescription>Datos basicos de tu negocio.</CardDescription>
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
    </div>
  );
}
