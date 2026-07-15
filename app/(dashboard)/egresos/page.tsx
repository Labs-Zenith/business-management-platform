import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listExpenses } from "@/lib/services/expense-service";
import { getCategoryLabel } from "@/lib/services/expense-dashboard-service";
import { listExpenseCategories } from "@/lib/services/catalog-service";
import { formatCOP } from "@/lib/money";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExpenseFormDialog from "@/components/domain/dashboard/expense-form-dialog";

/**
 * Egresos management screen, per Fase 5 Lane 4. Mirrors
 * `app/(dashboard)/customers/page.tsx`'s structure (header + action, plain
 * paginated `Table`) rather than the dashboard Egresos tab's KPI/chart
 * layout — this is the dedicated CRUD-entry surface for expenses, not a
 * reporting view. `requireSessionOrRedirect()` matches the guard pattern
 * already used by `customers/page.tsx`/`settings/page.tsx`.
 *
 * "Registrar egreso" reuses the EXISTING `ExpenseFormDialog`
 * (`components/domain/dashboard/expense-form-dialog.tsx`) as a modal
 * trigger — it already POSTs `/api/expenses` and calls `router.refresh()`
 * on success, so no new mutation surface is needed here. Registering now
 * happens on this page; the dashboard's Egresos tab is view-only (Fase 5
 * Lane 4 also removed its "Crear gasto" trigger).
 *
 * No export action: unlike `/customers`, `/invoices`, and `/payments`,
 * there is no `/api/expenses/export` route yet, so no `ExportMenu` is
 * rendered here (per the lane's explicit "if none, skip export" guidance).
 */

const PAGE_SIZE = 20;

type EgresosPageProps = {
  searchParams: Promise<{ page?: string }>;
};

function parsePageParam(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

export default async function EgresosPage({ searchParams }: EgresosPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;

  const [result, categories] = await Promise.all([
    listExpenses(session, {
      page: parsePageParam(params.page),
      pageSize: PAGE_SIZE,
    }),
    listExpenseCategories(),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <PageShell>
      <PageHeader
        title="Egresos"
        description="Registra y consulta los egresos de tu negocio."
        actions={
          <ExpenseFormDialog
            categories={categories.map((category) => ({ id: category.id, code: category.code, label: category.label }))}
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="size-4" />
                Registrar egreso
              </Button>
            }
          />
        }
      />

      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No se encontraron egresos.
              </TableCell>
            </TableRow>
          ) : (
            result.data.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{expense.expenseDate}</TableCell>
                <TableCell>{getCategoryLabel(expense.category)}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell className="text-right">{formatCOP(expense.amount)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="text-sm text-muted-foreground">
        Pagina {result.page} de {totalPages} - {result.total} egresos
      </p>
    </PageShell>
  );
}
