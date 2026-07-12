# Design: Nomina (Payroll) — Employees + Payroll Payments

## Technical Approach

Mirror existing entity plumbing exactly: `Employee` follows the **editable** Customer path (list/getById/create/update); `PayrollPayment` follows the **append-only** Payment/Expense path (list/getById/create). The one genuinely new mechanic is money-safe atomicity for `createPayrollPayment`, which must insert a `payroll_payments` row **and** its linked `category:'nomina'` expense as one all-or-nothing unit. All four gate layers (nav, middleware, page, route) reuse a new `requireCapability` pair backed by the existing `permissions.can()` deny-by-default map. Realizes the proposal's In-Scope items and Success Criteria.

## THE Critical Decision — Transaction capability (RESOLVED, not open)

**Finding (verified in code):** `lib/db/client.ts` uses `neon(connectionString)` — the `@neondatabase/serverless` **HTTP** driver. Its returned `sql` tagged-template function exposes a first-class `sql.transaction(queries[], opts?)` that runs multiple queries **as a single non-interactive Postgres transaction over one HTTPS request** (BEGIN/COMMIT server-side, atomic). Confirmed in `node_modules/@neondatabase/serverless/index.d.ts` (`NeonQueryFunction.transaction`, lines ~852-884) and README. This is **not** the WebSocket `Pool`/`Client` API and requires no extra setup — it works with the exact `sql` this codebase already has.

**Decision: use `sql.transaction([insertPayroll, insertExpense])` in `lib/db/payroll-repo.ts`.** The two INSERTs are data-independent (no FK between `expenses` and `payroll_payments`; neither needs the other's generated id), so the driver's only limitation — *non-interactive* (you cannot feed query 1's result into query 2 in the same round-trip) — does **not** apply here. No CTE workaround is needed; a real transaction is cleanly expressible.

```ts
// lib/db/payroll-repo.ts
async create(businessId: string, data: PayrollPaymentPersist, expense: ExpenseInput): Promise<PayrollPayment> {
  const [payrollRows] = (await sql.transaction([
    sql`INSERT INTO payroll_payments
          (id, business_id, employee_id, amount, period_type, period_start, period_end, payment_date, notes)
        VALUES (gen_random_uuid(), ${businessId}, ${data.employeeId}, ${data.amount}, ${data.periodType},
                ${data.periodStart}, ${data.periodEnd}, ${data.paymentDate}, ${data.notes ?? null})
        RETURNING *`,
    sql`INSERT INTO expenses (id, business_id, category, expense_date, description, amount, notes)
        VALUES (gen_random_uuid(), ${businessId}, 'nomina', ${expense.expenseDate}, ${expense.description},
                ${expense.amount}, ${expense.notes ?? null})`,
  ])) as unknown as [PayrollPaymentRow[], unknown];
  return toPayrollPayment(payrollRows[0]!);
}
```

**Mock equivalent (`lib/mock/payroll-repo.ts`):** `store.payrollPayments.set(...)` then `store.expenses.set(...)` with **no `await` between them** (unlike `payment-repo.ts`, do NOT add `simulateLatency` in `create`). Single-threaded JS gives trivial atomicity — no other code can observe a partial state because there is no interleaving point. Return the payroll payment.

## Architecture Decisions

### Decision: Reuse `expenseCreateSchema` for validation, inline the expense INSERT (not `createExpense()`) for execution
**Choice**: The service `createPayrollPayment` re-validates the derived expense payload with `expenseCreateSchema` (the *same* schema `createExpense` uses internally), then hands both payloads to `repositories.payroll.create`, which does the two-INSERT transaction.
**Alternatives considered**: (a) plumb a shared tx client so `createExpense()` runs *inside* the transaction. Rejected: `createExpense` awaits `repositories.expenses.create()`, a separate HTTP round-trip that cannot be composed into `sql.transaction`'s query array. (b) Skip validation entirely. Rejected: loses the amount/category/length invariants for the payroll caller.
**Rationale**: Preserves the validation contract (code reuse where it's safe) without breaking atomicity (execution where it must be single-statement). Same pattern the codebase already trusts — `expense-service.ts` documents itself as the reuse point but only its *schema* is reused here.

### Decision: `requireCapability` / `requireCapabilityOrNotFound` in `lib/session.ts`
**Choice**: Two thin helpers beside the existing session pair, taking an already-resolved `Session` + `Capability`, delegating to `permissions.can()`.
**Alternatives considered**: inline `if (!can(...)) throw` in each route. Rejected: drift across surfaces (proposal Risk R1).
**Rationale**: Matches the existing `requireSession` (route→throw) / `requireSessionOrRedirect` (page→redirect) duality; `notFound()` yields the 404 the worker must see.

### Decision: Capability-tagged nav item + `navItemsForRole` filter (not inline layout filter)
**Choice**: Add optional `capability?: Capability` to `NavItem`; add `navItemsForRole(role)`; thread an `items` prop into both nav components.
**Alternatives considered**: inline `.filter()` in `layout.tsx`. Rejected: not reusable for the next role-gated item.
**Rationale**: Extensible — future gated items are one array entry. Additive optional `items` prop (defaulting to `NAV_ITEMS`) keeps existing nav tests green (proposal Risk R4).

### Decision: Editable-entity type names mirror Customer (`EmployeeCreate`/`EmployeeUpdate`), superseding the proposal's loose "EmployeeInput"
**Rationale**: `active` must be create-excluded (hardcoded `true`) and update-included, exactly like `isActive`; the Customer `Create`/`Update` split is the correct precedent. Service-vs-repo payload split for payroll mirrors the `InvoicePersist` server-computed-payload precedent (`ports.ts` line ~152).

## Period Computation (`lib/services/payroll-period.ts`, new)

```ts
export type PeriodType = "quincenal" | "mensual";
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** referenceDate is "YYYY-MM-DD". Parsed by string slice (NO Date round-trip → no TZ shift). */
export function computePeriod(periodType: PeriodType, referenceDate: string): { periodStart: string; periodEnd: string } {
  const y = Number(referenceDate.slice(0, 4));
  const m = Number(referenceDate.slice(5, 7));      // 1-based month
  const day = Number(referenceDate.slice(8, 10));
  const lastDay = new Date(y, m, 0).getDate();       // day 0 of month m+1 = last day of month m (28/29/30/31 safe)
  if (periodType === "mensual") return { periodStart: iso(y, m, 1), periodEnd: iso(y, m, lastDay) };
  return day <= 15
    ? { periodStart: iso(y, m, 1), periodEnd: iso(y, m, 15) }
    : { periodStart: iso(y, m, 16), periodEnd: iso(y, m, lastDay) };
}

/** Display-only, never persisted (matches "don't store derivable values"). */
export function periodDays(periodStart: string, periodEnd: string): number {
  return Math.round((Date.parse(periodEnd) - Date.parse(periodStart)) / 86_400_000) + 1;
}
```
Timezone note: the only `Date` use is `new Date(y, m, 0).getDate()` — a local-midnight construction read only for day-of-month, which is TZ-stable. Output strings are built by formatting, never `toISOString()`.

## Interfaces / Contracts (`lib/services/ports.ts` additions)

```ts
// Employees (editable — Customer-style)
export type Employee = { id: string; businessId: string; name: string; baseSalary: number; active: boolean; createdAt: string; updatedAt: string; };
export type EmployeeCreate = { name: string; baseSalary: number };
export type EmployeeUpdate = Partial<EmployeeCreate> & { active?: boolean };
export type EmployeeListQuery = { q?: string; status?: "active" | "inactive"; page: number; pageSize: number };
export interface EmployeeRepository {
  list(businessId: string, query: EmployeeListQuery): Promise<Paged<Employee>>;
  getById(businessId: string, id: string): Promise<Employee | null>;
  create(businessId: string, data: EmployeeCreate): Promise<Employee>;
  update(businessId: string, id: string, data: EmployeeUpdate): Promise<Employee | null>;
}

// Payroll payments (append-only — Payment/Expense-style)
export type PeriodType = "quincenal" | "mensual";
export type PayrollPaymentInput = { employeeId: string; amount: number; periodType: PeriodType; referenceDate: string; paymentDate: string; notes?: string | null };
export type PayrollPaymentPersist = { employeeId: string; amount: number; periodType: PeriodType; periodStart: string; periodEnd: string; paymentDate: string; notes: string | null };
export type PayrollPayment = { id: string; businessId: string; employeeId: string; amount: number; periodType: PeriodType; periodStart: string; periodEnd: string; paymentDate: string; notes: string | null; createdAt: string };
export type PayrollPaymentWithEmployee = PayrollPayment & { employee: Pick<Employee, "id" | "name"> };
export type PayrollPaymentListQuery = { employeeId?: string; from?: string; to?: string; page: number; pageSize: number };
export interface PayrollPaymentRepository {
  list(businessId: string, query: PayrollPaymentListQuery): Promise<Paged<PayrollPaymentWithEmployee>>;
  getById(businessId: string, id: string): Promise<PayrollPaymentWithEmployee | null>;
  /** Atomic: inserts the payroll payment AND its `category:'nomina'` expense in ONE transaction. */
  create(businessId: string, data: PayrollPaymentPersist, expense: ExpenseInput): Promise<PayrollPayment>;
}
```

### Service (`lib/services/payroll-service.ts`)
```ts
export async function createPayrollPayment(session: Session, input: PayrollPaymentInput): Promise<PayrollPayment> {
  const { periodStart, periodEnd } = computePeriod(input.periodType, input.referenceDate);
  const employee = await repositories.employees.getById(session.businessId, input.employeeId);
  if (!employee) throw new ApiError("NOT_FOUND", "Employee not found.");
  const parsed = expenseCreateSchema.safeParse({
    category: "nomina", expenseDate: input.paymentDate,
    description: `Nómina ${employee.name} (${periodStart} — ${periodEnd})`,
    amount: input.amount, notes: input.notes ?? undefined,
  });
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid payroll expense payload.", parsed.error.flatten());
  return repositories.payroll.create(
    session.businessId,
    { employeeId: employee.id, amount: input.amount, periodType: input.periodType, periodStart, periodEnd, paymentDate: input.paymentDate, notes: input.notes ?? null },
    { category: "nomina", expenseDate: parsed.data.expenseDate, description: parsed.data.description, amount: parsed.data.amount, notes: parsed.data.notes ?? null },
  );
}
```
`employee-service.ts` is a line-for-line analog of `customer-service.ts` (sanitized `updateEmployee` forwarding only `name`/`baseSalary`/`active`).

### Capability helpers (`lib/session.ts`)
```ts
import { notFound } from "next/navigation";
import { can, type Capability } from "@/lib/services/permissions";
export function requireCapability(session: Session, capability: Capability): void {
  if (!can(session.role, capability)) throw new ApiError("FORBIDDEN", "You do not have access to this resource.");
}
export function requireCapabilityOrNotFound(session: Session, capability: Capability): void {
  if (!can(session.role, capability)) notFound();
}
```

### Nav (`components/layout/nav-items.ts`)
```ts
import { Banknote } from "lucide-react";
import { can, type Capability } from "@/lib/services/permissions";
export type NavItem = { href: string; label: string; icon: LucideIcon; capability?: Capability };
// add { href: "/nomina", label: "Nómina", icon: Banknote, capability: "viewPayroll" } before "Negocio"
export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.capability || can(role, i.capability));
}
```
`layout.tsx`: `const items = navItemsForRole(session.role)` → pass `items={items}` to `<DashboardSidebar>` and `<DashboardBottomNav>`. Both components accept `{ items = NAV_ITEMS }: { items?: NavItem[] }` (additive, backward-compatible).

## Migration (`migrations/1700000003000_add_payroll.sql`)

```sql
-- Up Migration
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  base_salary INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_business ON employees(business_id);

CREATE TABLE IF NOT EXISTS payroll_payments (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  amount INTEGER NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('quincenal', 'mensual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_business ON payroll_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee ON payroll_payments(employee_id);

-- Down Migration
DROP TABLE IF EXISTS payroll_payments CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
```
`payroll_payments` has **no `updated_at`** (append-only, no edit — per proposal). Drop payroll first (FK dependent).

## Middleware (`middleware.ts`)

Add to `PROTECTED_PATH_PREFIXES`: `"/nomina"`, `"/api/employees"`, `"/api/payroll-payments"`. Add to `matcher`: `"/nomina/:path*"`, `"/api/employees/:path*"`, `"/api/payroll-payments/:path*"`. Stays presence-only — **role is never checked here** (per convention); the capability gate lives at page + route.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/1700000003000_add_payroll.sql` | Create | `employees` + `payroll_payments` + 3 indexes; Down drops both |
| `lib/services/payroll-period.ts` | Create | `computePeriod` + `periodDays` |
| `lib/services/ports.ts` | Modify | Employee/PayrollPayment types + repositories |
| `lib/db/employee-repo.ts` | Create | Editable Postgres repo (Customer pattern) |
| `lib/db/payroll-repo.ts` | Create | Append-only + owns the `sql.transaction` two-insert |
| `lib/mock/employee-repo.ts` | Create | Customer-style mock repo |
| `lib/mock/payroll-repo.ts` | Create | Synchronous two-`Map.set` create (no await gap) |
| `lib/services/employee-service.ts` | Create | Customer-style CRUD |
| `lib/services/payroll-service.ts` | Create | `createPayrollPayment` (period + atomic linkage) |
| `lib/services/repositories.ts` | Modify | Add `employees` + `payroll` ternaries |
| `lib/mock/store.ts` | Modify | `employees`/`payrollPayments` maps in type/serialize/clear/hydrate/createEmptyStore |
| `lib/mock/fixtures/{data,index}.ts` | Modify | Demo employees + payroll (in `seedFixtures` only, NOT `seedMinimal`) |
| `lib/schemas/employee.ts` | Create | `.strict()` create/update |
| `lib/schemas/payroll-payment.ts` | Create | `.strict()` create (employeeId, amount, periodType, referenceDate, paymentDate, notes) |
| `lib/session.ts` | Modify | `requireCapability` / `requireCapabilityOrNotFound` |
| `app/api/employees/route.ts` | Create | GET/POST, gated |
| `app/api/employees/[id]/route.ts` | Create | PATCH, gated |
| `app/api/payroll-payments/route.ts` | Create | GET/POST, gated |
| `app/(dashboard)/nomina/page.tsx` | Create | Gated Empleados/Pagos tabs (Tabs+keepMounted) |
| `components/domain/nomina/employee-form-dialog*.tsx` | Create | Create/edit (Customer dialog precedent) |
| `components/domain/nomina/payroll-payment-form-dialog*.tsx` | Create | Entry form (Expense dialog precedent) |
| `components/layout/nav-items.ts` | Modify | `capability` field + `navItemsForRole` + Nómina item |
| `components/layout/dashboard-{sidebar,bottom-nav}.tsx` | Modify | Optional `items` prop |
| `app/(dashboard)/layout.tsx` | Modify | Thread `navItemsForRole(session.role)` to both navs |
| `middleware.ts` | Modify | 3 prefixes + 3 matcher entries |

### Routes & page structure
- Every payroll route: `const session = await requireSession(); requireCapability(session, "viewPayroll");` then `checkOrigin(request)` on mutations, `.strict()` schema parse, service call — mirroring `app/api/expenses/route.ts` and `app/api/customers/[id]/route.ts`.
- `nomina/page.tsx`: `const session = await requireSessionOrRedirect(); requireCapabilityOrNotFound(session, "viewPayroll");` then `<Tabs>` with `Empleados`/`Pagos` `TabsPanel`s (both `keepMounted`), mirroring `dashboard/page.tsx`. Empleados = employees list + "Crear empleado" dialog; Pagos = payroll list + "Registrar pago" dialog.

### Dialogs
- **Employee** (`employee-form-dialog-content.tsx`): plain `useState` like `customer-form-dialog-content.tsx`. Fields: `name`, `baseSalary` (pesos→cents via `pesosToCents`), `active` toggle (edit mode only, excluded on create). POST `/api/employees` or PATCH `/api/employees/[id]`, then `router.refresh()`. Lazy `dynamic(..., {ssr:false})`.
- **Payroll payment** (`payroll-payment-form-dialog-content.tsx`): RHF + `zodResolver` like `expense-form-dialog-content.tsx`. Fields: `employeeId` (select from a passed active-employees list), `amount` (pesos→cents), `periodType` (select), `referenceDate` (date, default `todayIsoDate()`), `paymentDate` (date, default today), `notes`. Live preview of the derived range via client `computePeriod(periodType, referenceDate)` + `periodDays`. POST `/api/payroll-payments`, then `router.refresh()`.

## Data Flow

    Registrar-pago dialog ──POST──> /api/payroll-payments (requireCapability)
         │                                   │
         │                          payroll-service.createPayrollPayment
         │                                   │ computePeriod + expenseCreateSchema validate
         │                                   ▼
         │                          repositories.payroll.create
         │                                   │  DB: sql.transaction([INSERT payroll, INSERT expense])
         │                                   │  mock: Map.set(payroll); Map.set(expense)  (no await gap)
         └── router.refresh() ──> Nomina Pagos tab + dashboard Egresos both reflect the row

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `computePeriod` boundaries (day 15/16, Feb 28/29, 30/31-day months, mensual span) | Table-driven, matches Success Criteria |
| Unit | `permissions.can("worker","viewPayroll")===false` (already covered) + `requireCapability`/`OrNotFound` throw/notFound paths | Mock session |
| Integration | `createPayrollPayment` writes BOTH rows; mock partial-state impossibility (snapshot store before/after, like `payment-service.test.ts`) | Service + mock repo |
| Integration | `worker` → 403 from every payroll route; `admin` → success | Route handlers with role'd sessions |
| Integration | `navItemsForRole("worker")` excludes Nómina; `("admin")` includes it | Pure function |
| E2E/component | Nomina page 404 for worker; sidebar/bottom-nav render with `items` prop | Component render tests updated |

## Migration / Rollout

Additive. Revert PR + `DROP TABLE payroll_payments, employees CASCADE`. Nomina-created expenses remain inert `category:'nomina'` rows already tolerated by the dashboard — no income/expense regression.

## Open Questions

- [ ] **Bottom-nav column count**: `dashboard-bottom-nav.tsx` hardcodes `grid-cols-5`; admin now has 6 items. Resolve in tasks with a static `GRID_COLS: Record<number,string>` map (`{5:"grid-cols-5",6:"grid-cols-6"}`) keyed by `items.length` — Tailwind cannot safelist an interpolated class. Non-blocking, low risk.
- [ ] Residual driver note (not a blocker): `sql.transaction` is **non-interactive** — safe here because the two inserts are data-independent. If a future change needs the payroll id *inside* the expense row, switch to a CTE (`payment-repo.ts` precedent). Flagged for awareness only.
