import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getBusinessProfile } from "@/lib/services/business-service";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Negocio / ajustes screen, per `docs/ui-ux-flow.md` and
 * `openspec/changes/mocked-mvp-scaffold/specs/business-profile/spec.md`.
 *
 * Read-only for this change: no form, no PATCH endpoint exists — editing is
 * explicitly deferred. `requireSessionOrRedirect()` runs before any data fetch
 * (defense in depth alongside `middleware.ts`'s route guard on `/settings`);
 * an unauthenticated request never reaches `getBusinessProfile`.
 */
export default async function SettingsPage() {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const business = await getBusinessProfile(session);

  const fields = [
    { label: "Nombre", value: business.name },
    { label: "Telefono", value: business.phone ?? "-" },
    { label: "Email", value: business.email ?? "-" },
    { label: "Direccion", value: business.address ?? "-" },
    { label: "Moneda", value: business.currency },
  ];

  return (
    <div className="flex flex-1 flex-col p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Negocio</CardTitle>
          <CardDescription>
            Datos basicos de tu negocio. Esta version es de solo lectura.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4">
            {fields.map((field) => (
              <div key={field.label} className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                <dd className="text-sm font-medium">{field.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
