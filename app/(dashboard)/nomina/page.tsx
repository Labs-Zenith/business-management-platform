import { Plus } from "lucide-react";
import { requireCapabilityOrNotFound } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listEmployees } from "@/lib/services/employee-service";
import { listPayrollPayments } from "@/lib/services/payroll-service";
import { listPayrollPeriodTypes } from "@/lib/services/catalog-service";
import { employeeSorter, payrollPaymentSorter } from "@/lib/services/sorting";
import { parsePageParam } from "@/lib/pagination";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
import { TablePagination } from "@/components/domain/table-pagination";
import { TableSortHeader } from "@/components/domain/table-sort-header";
import EmployeeFormDialog from "@/components/domain/nomina/employee-form-dialog";
import PayrollPaymentFormDialog from "@/components/domain/nomina/payroll-payment-form-dialog";

/**
 * Nomina (payroll) screen, per `openspec/changes/nomina-payroll/proposal.md`'s
 * Approach ("Single 'Nomina' page with Empleados/Pagos tabs") and
 * `design.md`'s "Routes & page structure" section. This is the app's FIRST
 * role-gated page: `requireCapabilityOrNotFound("viewPayroll")` is the
 * SINGLE authoritative gate (it already resolves the session via
 * `requireSessionOrRedirect()` internally and calls `notFound()` for a role
 * lacking the capability, per `lib/session.ts`) — a `worker` hitting
 * `/nomina` directly gets a 404, never a redirect, never page content.
 *
 * Mirrors `app/(dashboard)/dashboard/page.tsx`'s Tabs+keepMounted pattern
 * (both `TabsPanel`s are `keepMounted` so switching tabs never discards
 * already-rendered content) and `app/(dashboard)/customers/page.tsx`'s
 * Server Component data-fetching shape (fetch via the service directly, not
 * a self-fetch of the API routes — those exist for the client-side mutation
 * dialogs).
 *
 * "Registrar pago" only offers ACTIVE employees in its select (an inactive
 * employee should not receive new payroll payments), computed here via a
 * plain filter over the already-fetched Empleados list — no second query.
 *
 * Empleados/Pagos each paginate independently via their own
 * `?employeesPage=`/`?paymentsPage=` search params (real pagination — see
 * `components/domain/table-pagination.tsx`). The active tab is persisted in
 * `?tab=` so a page-link click (a full GET navigation) doesn't bounce the
 * user back to the Empleados tab: each `<TablePagination>` below hardcodes
 * the `tab` value for the panel it lives in (omitted for the default
 * Empleados tab, `"pagos"` for the Pagos one) rather than echoing back
 * whatever `tab` the current URL happened to carry.
 */
const PAGE_SIZE = 20;

type NominaPageProps = {
  searchParams: Promise<{
    employeesPage?: string;
    employeesSort?: string;
    employeesDir?: string;
    paymentsPage?: string;
    paymentsSort?: string;
    paymentsDir?: string;
    tab?: string;
  }>;
};

function parseTabParam(raw: string | undefined): "empleados" | "pagos" {
  return raw === "pagos" ? "pagos" : "empleados";
}

export default async function NominaPage({ searchParams }: NominaPageProps) {
  await loadStoreFromCookie();
  const session = await requireCapabilityOrNotFound("viewPayroll");
  const params = await searchParams;
  const activeTab = parseTabParam(params.tab);

  // Each table owns a namespaced sort pair, mirroring the existing
  // `employeesPage`/`paymentsPage` split, so sorting one never disturbs the
  // other.
  const employeesSort = employeeSorter.parse(params.employeesSort, params.employeesDir);
  const paymentsSort = payrollPaymentSorter.parse(params.paymentsSort, params.paymentsDir);

  const [employeesResult, paymentsResult, periodTypes] = await Promise.all([
    listEmployees(session, {
      sortBy: employeesSort.sortBy,
      sortDir: employeesSort.sortDir,
      page: parsePageParam(params.employeesPage),
      pageSize: PAGE_SIZE,
    }),
    listPayrollPayments(session, {
      sortBy: paymentsSort.sortBy,
      sortDir: paymentsSort.sortDir,
      page: parsePageParam(params.paymentsPage),
      pageSize: PAGE_SIZE,
    }),
    listPayrollPeriodTypes(),
  ]);

  // `tab` is hardcoded per panel rather than echoed from the URL, matching
  // each `<TablePagination>` below: a sort click must never bounce the user
  // to the other tab.
  const employeesSortProps = {
    current: employeesSort,
    defaultSort: employeeSorter.defaultSort,
    pathname: "/nomina",
    params: { ...params, tab: undefined },
    sortParam: "employeesSort",
    dirParam: "employeesDir",
    pageParam: "employeesPage",
  };
  const paymentsSortProps = {
    current: paymentsSort,
    defaultSort: payrollPaymentSorter.defaultSort,
    pathname: "/nomina",
    params: { ...params, tab: "pagos" },
    sortParam: "paymentsSort",
    dirParam: "paymentsDir",
    pageParam: "paymentsPage",
  };

  const activeEmployees = employeesResult.data
    .filter((employee) => employee.active)
    .map((employee) => ({ id: employee.id, name: employee.name }));

  return (
    <PageShell>
      <PageHeader
        title="Nómina"
        description="Gestiona empleados y registra pagos de nómina."
        actions={
          <>
            <EmployeeFormDialog
              mode="create"
              trigger={
                <Button className="w-full sm:w-auto">
                  <Plus className="size-4" />
                  Nuevo empleado
                </Button>
              }
            />
            <PayrollPaymentFormDialog
              employees={activeEmployees}
              periodTypes={periodTypes.map((type) => ({ id: type.id, code: type.code, label: type.label }))}
              trigger={
                <Button className="w-full sm:w-auto">
                  <Plus className="size-4" />
                  Registrar pago
                </Button>
              }
            />
          </>
        }
      />

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTab value="empleados">Empleados</TabsTab>
          <TabsTab value="pagos">Pagos de nómina</TabsTab>
        </TabsList>

        {/* keepMounted is required: do not remove, matches dashboard/page.tsx's
            established mechanic — see that file's comment for the full
            rationale (base-ui's default unmounts inactive panels). */}
        <TabsPanel value="empleados" keepMounted>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableSortHeader label="Nombre" sortBy="name" {...employeesSortProps} />
                <TableSortHeader label="Salario base" sortBy="baseSalary" firstDir="desc" align="right" {...employeesSortProps} />
                <TableSortHeader label="Estado" sortBy="status" {...employeesSortProps} />
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeesResult.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No se encontraron empleados.
                  </TableCell>
                </TableRow>
              ) : (
                employeesResult.data.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount cents={employee.baseSalary} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={employee.active ? "success" : "outline"}>
                        {employee.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <EmployeeFormDialog
                        mode="edit"
                        employee={employee}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Editar
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <TablePagination
            page={employeesResult.page}
            pageSize={employeesResult.pageSize}
            total={employeesResult.total}
            pathname="/nomina"
            paramName="employeesPage"
            params={{ ...params, tab: undefined }}
            itemLabel="empleados"
          />
        </TabsPanel>

        {/* keepMounted is required: do not remove — see the Empleados panel's comment above. */}
        <TabsPanel value="pagos" keepMounted>
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableSortHeader label="Empleado" sortBy="employeeName" {...paymentsSortProps} />
                <TableSortHeader label="Periodo" sortBy="periodStart" firstDir="desc" {...paymentsSortProps} />
                <TableSortHeader label="Monto" sortBy="amount" firstDir="desc" align="right" {...paymentsSortProps} />
                <TableSortHeader label="Fecha de pago" sortBy="paymentDate" firstDir="desc" {...paymentsSortProps} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentsResult.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No se encontraron pagos de nómina.
                  </TableCell>
                </TableRow>
              ) : (
                paymentsResult.data.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.employee.name}</TableCell>
                    <TableCell>
                      {payment.periodStart} a {payment.periodEnd}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount cents={payment.amount} />
                    </TableCell>
                    <TableCell>{payment.paymentDate}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <TablePagination
            page={paymentsResult.page}
            pageSize={paymentsResult.pageSize}
            total={paymentsResult.total}
            pathname="/nomina"
            paramName="paymentsPage"
            params={{ ...params, tab: "pagos" }}
            itemLabel="pagos de nómina"
          />
        </TabsPanel>
      </Tabs>
    </PageShell>
  );
}
