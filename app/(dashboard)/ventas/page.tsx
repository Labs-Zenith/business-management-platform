import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { isPipelineEnabled } from "@/lib/services/features";
import { listPipelineCards } from "@/lib/services/pipeline-service";
import { listCustomers } from "@/lib/services/customer-service";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import NuevaCardDialog from "@/components/domain/ventas/nueva-card-dialog";
import VentasBoard from "@/components/domain/ventas/ventas-board";

/**
 * Ventas (sales pipeline kanban board) screen, per the plan at
 * `~/.claude/plans/revisa-el-proyecto-dime-temporal-moonbeam.md`'s Parte B/C.
 * Gated by a per-BUSINESS feature flag (`isPipelineEnabled`,
 * `lib/services/features.ts`) rather than a role capability — ANY role
 * within an enabled business sees the board. `notFound()` here (not a
 * redirect) mirrors `requireCapabilityOrNotFound`'s established "hide the
 * feature exists" behavior for a business that doesn't have it enabled, per
 * `nomina/page.tsx`'s doc comment for the same rationale. This is the
 * REAL authority — `nav-items.ts`'s `navItemsFor` hiding the "Ventas" link
 * is a UX complement only.
 *
 * `listPipelineCards` returns EVERY card for the business (no pagination —
 * a pipeline is bounded, see `PipelineRepository`'s doc comment in
 * `lib/services/ports.ts`); `VentasBoard` groups them into columns
 * client-side. `listCustomers` is fetched at a generous `pageSize` (200) —
 * same convention as `nomina/page.tsx`'s active-employees list — purely to
 * populate the create/edit dialogs' customer `<Select>`, mapped down to the
 * minimal `{id, name}` shape both dialogs need.
 */
const CUSTOMERS_PAGE_SIZE = 200;

export default async function VentasPage() {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();

  if (!isPipelineEnabled(session.businessId)) {
    notFound();
  }

  const [cards, customersResult] = await Promise.all([
    listPipelineCards(session),
    listCustomers(session, { page: 1, pageSize: CUSTOMERS_PAGE_SIZE }),
  ]);

  const customers = customersResult.data.map((customer) => ({ id: customer.id, name: customer.name }));

  return (
    <PageShell className="max-w-none">
      <PageHeader
        title="Ventas"
        description="Tablero de tu pipeline de ventas."
        actions={
          <NuevaCardDialog
            customers={customers}
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="size-4" />
                Nueva
              </Button>
            }
          />
        }
      />
      <VentasBoard initialCards={cards} customers={customers} />
    </PageShell>
  );
}
