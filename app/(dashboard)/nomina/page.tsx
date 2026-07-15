import { Plus } from "lucide-react";
import { requireCapabilityOrNotFound } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listEmployees } from "@/lib/services/employee-service";
import { listPayrollPayments } from "@/lib/services/payroll-service";
import { listPayrollPeriodTypes } from "@/lib/services/catalog-service";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
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
 */

/**
 * Intentional MVP limitation: this is a hard display cap, NOT real
 * pagination — unlike `customers`/`payments`/`invoices`, this page has no
 * `searchParams`, no page navigation UI, and always fetches `page: 1`.
 * Businesses with more than this many employees or payroll payments will not
 * see the excess rows. Real pagination for Nomina is a future feature.
 */
const MAX_DISPLAYED_ROWS = 50;

export default async function NominaPage() {
  await loadStoreFromCookie();
  const session = await requireCapabilityOrNotFound("viewPayroll");

  const [employeesResult, paymentsResult, periodTypes] = await Promise.all([
    listEmployees(session, { page: 1, pageSize: MAX_DISPLAYED_ROWS }),
    listPayrollPayments(session, { page: 1, pageSize: MAX_DISPLAYED_ROWS }),
    listPayrollPeriodTypes(),
  ]);

  const activeEmployees = employeesResult.data
    .filter((employee) => employee.active)
    .map((employee) => ({ id: employee.id, name: employee.name }));

  return (
    <PageShell>
      <PageHeader
        title="Nomina"
        description="Gestiona empleados y registra pagos de nomina."
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

      <Tabs defaultValue="empleados">
        <TabsList>
          <TabsTab value="empleados">Empleados</TabsTab>
          <TabsTab value="pagos">Pagos de nomina</TabsTab>
        </TabsList>

        {/* keepMounted is required: do not remove, matches dashboard/page.tsx's
            established mechanic — see that file's comment for the full
            rationale (base-ui's default unmounts inactive panels). */}
        <TabsPanel value="empleados" keepMounted>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Salario base</TableHead>
                <TableHead>Estado</TableHead>
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
        </TabsPanel>

        {/* keepMounted is required: do not remove — see the Empleados panel's comment above. */}
        <TabsPanel value="pagos" keepMounted>
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Fecha de pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentsResult.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No se encontraron pagos de nomina.
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
        </TabsPanel>
      </Tabs>
    </PageShell>
  );
}
