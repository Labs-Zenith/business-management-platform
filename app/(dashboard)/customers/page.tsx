import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
import { canDeleteRecords } from "@/lib/services/permissions";
import { customerSorter } from "@/lib/services/sorting";
import { parsePageParam } from "@/lib/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HiddenParams } from "@/components/domain/filters/hidden-params";
import { SelectFilterField } from "@/components/domain/filters/select-filter-field";
import { MoneyAmount } from "@/components/domain/money-amount";
import { PageHeader } from "@/components/domain/page-header";
import { TablePagination } from "@/components/domain/table-pagination";
import { TableSortHeader } from "@/components/domain/table-sort-header";
import CustomerFormDialog from "@/components/domain/customers/customer-form-dialog";
import DeleteCustomerButton from "@/components/domain/customers/delete-customer-button";

/**
 * Clientes screen, per `docs/ui-ux-flow.md`'s "Clientes" section and
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md`. Fetches
 * via `customer-service` directly (a Server Component call, not a
 * self-fetch of `/api/customers`) — the API route exists for the client-side
 * mutation dialogs (`CustomerFormDialog`, mirroring `EmployeeFormDialog`'s
 * pattern in `nomina/page.tsx`).
 *
 * `requireSessionOrRedirect()` runs first (defense in depth alongside
 * `middleware.ts`'s `/customers` guard), matching the pattern established in
 * `settings/page.tsx` (PR3).
 */

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; dir?: string; page?: string }>;
};

function parseStatusParam(raw: string | undefined): "active" | "inactive" | undefined {
  return raw === "active" || raw === "inactive" ? raw : undefined;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;
  const status = parseStatusParam(params.status);
  // UX only — the enforcing gate is `requireCapability("deleteRecords")` on
  // `DELETE /api/customers/{id}`. Same pattern as `settings/page.tsx`'s
  // `canEdit`.
  const canDelete = canDeleteRecords(session.role);

  const sort = customerSorter.parse(params.sort, params.dir);

  const result = await listCustomers(session, {
    q: params.q || undefined,
    status,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    page: parsePageParam(params.page),
    pageSize: PAGE_SIZE,
  });

  const sortHeaderProps = {
    current: sort,
    defaultSort: customerSorter.defaultSort,
    pathname: "/customers",
    params,
  };

  return (
    <PageShell>
      <PageHeader
        title="Clientes"
        description="Gestiona tus clientes y consulta su saldo pendiente."
        actions={
          <CustomerFormDialog
            mode="create"
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="size-4" />
                Crear cliente
              </Button>
            }
          />
        }
      />

      <form method="get" className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm text-muted-foreground">
            Buscar
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Nombre, documento, email o teléfono"
            className="w-full"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Estado
          </label>
          <SelectFilterField id="status" name="status" defaultValue={status ?? ""} options={STATUS_OPTIONS} />
        </div>
        {/* Not `page`: filtering should reset to the first page. */}
        <HiddenParams params={{ sort: params.sort, dir: params.dir }} />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableSortHeader label="Nombre" sortBy="name" {...sortHeaderProps} />
            <TableSortHeader label="Teléfono" sortBy="phone" {...sortHeaderProps} />
            <TableSortHeader label="Saldo pendiente" sortBy="balance" firstDir="desc" align="right" {...sortHeaderProps} />
            <TableSortHeader label="Estado" sortBy="status" {...sortHeaderProps} />
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No se encontraron clientes.
              </TableCell>
            </TableRow>
          ) : (
            result.data.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                    {customer.name}
                  </Link>
                </TableCell>
                <TableCell>{customer.phone ?? "-"}</TableCell>
                <TableCell className="text-right">
                  <MoneyAmount cents={customer.balance} />
                </TableCell>
                <TableCell>
                  <Badge variant={customer.isActive ? "success" : "outline"}>
                    {customer.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <CustomerFormDialog
                      mode="edit"
                      customer={customer}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      }
                    />
                    {canDelete ? (
                      <DeleteCustomerButton
                        customerId={customer.id}
                        customerName={customer.name}
                        customerActive={customer.isActive}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <TablePagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        pathname="/customers"
        params={params}
        itemLabel="clientes"
      />
    </PageShell>
  );
}
