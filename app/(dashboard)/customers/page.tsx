import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
import { PageHeader } from "@/components/domain/page-header";

/**
 * Clientes screen, per `docs/ui-ux-flow.md`'s "Clientes" section and
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md`. Fetches
 * via `customer-service` directly (a Server Component call, not a
 * self-fetch of `/api/customers`) — the API route exists for the client-side
 * mutation dialog and any future non-page consumer.
 *
 * `requireSessionOrRedirect()` runs first (defense in depth alongside
 * `middleware.ts`'s `/customers` guard), matching the pattern established in
 * `settings/page.tsx` (PR3).
 */

const PAGE_SIZE = 20;

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
};

function parsePageParam(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function parseStatusParam(raw: string | undefined): "active" | "inactive" | undefined {
  return raw === "active" || raw === "inactive" ? raw : undefined;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;
  const status = parseStatusParam(params.status);

  const result = await listCustomers(session, {
    q: params.q || undefined,
    status,
    page: parsePageParam(params.page),
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <PageShell>
      <PageHeader
        title="Clientes"
        description="Gestiona tus clientes y consulta su saldo pendiente."
        actions={
          <Button className="w-full sm:w-auto" nativeButton={false} render={<Link href="/customers/new" />}>
            <Plus className="size-4" />
            Crear cliente
          </Button>
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
            placeholder="Nombre, documento, email o telefono"
            className="w-full"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
          >
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Telefono</TableHead>
            <TableHead className="text-right">Saldo pendiente</TableHead>
            <TableHead>Estado</TableHead>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/customers/${customer.id}/edit`} />}
                  >
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="text-sm text-muted-foreground">
        Pagina {result.page} de {totalPages} - {result.total} clientes
      </p>
    </PageShell>
  );
}
