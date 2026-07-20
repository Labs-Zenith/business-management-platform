import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  Employee,
  EmployeeListQuery,
  Paged,
  PayrollPaymentListQuery,
  PayrollPaymentWithEmployee,
  Session,
} from "@/lib/services/ports";

/**
 * `app/(dashboard)/nomina/page.tsx`, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`'s
 * "Server-Side Layer Is Authoritative" requirement — the highest-value test
 * here proves a `worker`-denied session results in the page's promise
 * REJECTING with `notFound()`'s digest (a real 404), never rendering page
 * content, mirroring `customers/page.test.tsx`'s "redirects to /login"
 * defense-in-depth test shape but for the capability gate instead of plain
 * auth.
 */

const mockRequireCapabilityOrNotFound = vi.fn<(capability: string) => Promise<Session>>();
const mockListEmployees = vi.fn<(session: Session, query: EmployeeListQuery) => Promise<Paged<Employee>>>();
const mockListPayrollPayments =
  vi.fn<(session: Session, query: PayrollPaymentListQuery) => Promise<Paged<PayrollPaymentWithEmployee>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireCapabilityOrNotFound: (capability: string) => mockRequireCapabilityOrNotFound(capability),
}));

vi.mock("@/lib/services/employee-service", () => ({
  listEmployees: (session: Session, query: EmployeeListQuery) => mockListEmployees(session, query),
}));

vi.mock("@/lib/services/payroll-service", () => ({
  listPayrollPayments: (session: Session, query: PayrollPaymentListQuery) => mockListPayrollPayments(session, query),
}));

// Dialogs are lazy (`dynamic(..., {ssr:false})`) via `./employee-form-dialog`
// / `./payroll-payment-form-dialog` — stubbed to their trigger only, mirroring
// `dashboard/page.test.tsx`'s "sections aren't rendered/DOM-tested
// individually" convention; the dialogs have their own `.test.tsx` files.
vi.mock("@/components/domain/nomina/employee-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
}));
// Renders the trigger AND a hidden marker exposing the `employees` prop it
// received, so this file's "only active employees" test can assert on the
// filtered list actually threaded down from the page, without needing the
// dialog's own (separately tested) internals.
vi.mock("@/components/domain/nomina/payroll-payment-form-dialog", () => ({
  default: ({ trigger, employees }: { trigger: ReactNode; employees: Array<{ id: string; name: string }> }) => (
    <>
      {trigger}
      <div data-testid="payroll-dialog-employees">{JSON.stringify(employees)}</div>
    </>
  ),
}));

import NominaPage from "./page";

const ADMIN_SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const EMPLOYEE: Employee = {
  id: "60000000-0000-4000-8000-000000000001",
  businessId: ADMIN_SESSION.businessId,
  name: "Ana Empleada",
  baseSalary: 150_000_00,
  active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const PAYMENT: PayrollPaymentWithEmployee = {
  id: "70000000-0000-4000-8000-000000000001",
  businessId: ADMIN_SESSION.businessId,
  employeeId: EMPLOYEE.id,
  amount: 75_000_00,
  periodType: "quincenal",
  periodTypeId: "c5000000-0000-4000-8000-000000000001",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-15",
  paymentDate: "2026-07-20",
  notes: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  employee: { id: EMPLOYEE.id, name: EMPLOYEE.name },
};

describe("NominaPage", () => {
  beforeEach(() => {
    mockRequireCapabilityOrNotFound.mockReset();
    mockListEmployees.mockReset();
    mockListPayrollPayments.mockReset();
  });

  it("gates on requireCapabilityOrNotFound('viewPayroll') and renders both Empleados/Pagos tab content (keepMounted) for an admin session", async () => {
    mockRequireCapabilityOrNotFound.mockResolvedValue(ADMIN_SESSION);
    mockListEmployees.mockResolvedValue({ data: [EMPLOYEE], page: 1, pageSize: 50, total: 1 });
    mockListPayrollPayments.mockResolvedValue({ data: [PAYMENT], page: 1, pageSize: 50, total: 1 });

    render(await NominaPage({ searchParams: Promise.resolve({}) }));

    expect(mockRequireCapabilityOrNotFound).toHaveBeenCalledWith("viewPayroll");
    expect(mockListEmployees).toHaveBeenCalledWith(ADMIN_SESSION, { page: 1, pageSize: 20 });
    expect(mockListPayrollPayments).toHaveBeenCalledWith(ADMIN_SESSION, { page: 1, pageSize: 20 });

    // Empleados tab (active by default). "Ana Empleada" appears TWICE — once
    // as the employee row (active panel) and once as the payment row's
    // employee name (Pagos panel, keepMounted) — proving both panels are
    // genuinely rendered simultaneously, not just the active one.
    expect(screen.getAllByText("Ana Empleada")).toHaveLength(2);
    expect(screen.getByText("Activo")).toBeInTheDocument();

    // Pagos tab content is ALSO present (keepMounted), even though inactive.
    expect(screen.getByText(/2026-07-01/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-15/)).toBeInTheDocument();
  });

  it("results in a 404 for a worker session — requireCapabilityOrNotFound's notFound() rejects the page, and no data is fetched", async () => {
    // Mirrors `lib/session.test.ts`'s real `requireCapabilityOrNotFound`
    // behavior: `notFound()` throws a digest-tagged error rather than
    // returning, so nothing past that call ever runs.
    mockRequireCapabilityOrNotFound.mockRejectedValue(
      Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      }),
    );

    await expect(NominaPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });

    expect(mockListEmployees).not.toHaveBeenCalled();
    expect(mockListPayrollPayments).not.toHaveBeenCalled();
  });

  it("shows empty states when there are no employees or payroll payments", async () => {
    mockRequireCapabilityOrNotFound.mockResolvedValue(ADMIN_SESSION);
    mockListEmployees.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });
    mockListPayrollPayments.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await NominaPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron empleados/i)).toBeInTheDocument();
    expect(screen.getByText(/no se encontraron pagos de nomina/i)).toBeInTheDocument();
  });

  it("offers the 'Nuevo empleado' and 'Registrar pago' quick actions", async () => {
    mockRequireCapabilityOrNotFound.mockResolvedValue(ADMIN_SESSION);
    mockListEmployees.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });
    mockListPayrollPayments.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await NominaPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("button", { name: "Nuevo empleado" })).toBeInTheDocument();
    // "Registrar pago" lives in the (keepMounted but currently inactive) Pagos
    // panel — base-ui marks it `hidden`, so it's excluded from the
    // accessibility tree by default; `{ hidden: true }` proves it is still
    // genuinely present in the DOM (keepMounted), not discarded.
    expect(screen.getByRole("button", { name: "Registrar pago", hidden: true })).toBeInTheDocument();
  });

  it("only offers ACTIVE employees to the Registrar pago dialog", async () => {
    mockRequireCapabilityOrNotFound.mockResolvedValue(ADMIN_SESSION);
    const inactiveEmployee: Employee = { ...EMPLOYEE, id: "60000000-0000-4000-8000-000000000002", active: false };
    mockListEmployees.mockResolvedValue({
      data: [EMPLOYEE, inactiveEmployee],
      page: 1,
      pageSize: 50,
      total: 2,
    });
    mockListPayrollPayments.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await NominaPage({ searchParams: Promise.resolve({}) }));

    const employeesProp = JSON.parse(screen.getByTestId("payroll-dialog-employees").textContent ?? "[]") as Array<{
      id: string;
      name: string;
    }>;
    expect(employeesProp).toEqual([{ id: EMPLOYEE.id, name: EMPLOYEE.name }]);
  });

  it("parses employeesPage/paymentsPage independently and threads them to their own service call", async () => {
    mockRequireCapabilityOrNotFound.mockResolvedValue(ADMIN_SESSION);
    mockListEmployees.mockResolvedValue({ data: [EMPLOYEE], page: 3, pageSize: 20, total: 100 });
    mockListPayrollPayments.mockResolvedValue({ data: [PAYMENT], page: 2, pageSize: 20, total: 45 });

    render(
      await NominaPage({
        searchParams: Promise.resolve({ employeesPage: "3", paymentsPage: "2", tab: "pagos" }),
      }),
    );

    expect(mockListEmployees).toHaveBeenCalledWith(ADMIN_SESSION, { page: 3, pageSize: 20 });
    expect(mockListPayrollPayments).toHaveBeenCalledWith(ADMIN_SESSION, { page: 2, pageSize: 20 });

    // Both panels' "Siguiente" links exist (keepMounted, one panel hidden);
    // disambiguate by href — each hardcodes the `tab` value for its own
    // panel rather than echoing back the incoming `?tab=pagos`.
    const allNextLinks = screen.getAllByRole("link", { name: /siguiente/i, hidden: true });
    const employeesHref = allNextLinks.find((link) => link.getAttribute("href")?.includes("employeesPage=4"));
    const paymentsHref = allNextLinks.find((link) => link.getAttribute("href")?.includes("paymentsPage=3"));

    expect(employeesHref).toBeDefined();
    expect(employeesHref!.getAttribute("href")).toBe("/nomina?paymentsPage=2&employeesPage=4");

    expect(paymentsHref).toBeDefined();
    expect(paymentsHref!.getAttribute("href")).toBe("/nomina?employeesPage=3&tab=pagos&paymentsPage=3");
  });
});
