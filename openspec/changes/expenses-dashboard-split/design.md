# Design: Expenses Tracking + Dashboard Ingresos/Egresos Split

## Context

Phase 2 (plan point 5) adds a generic `expenses` entity and splits the dashboard into **Ingresos** (existing income view, untouched) and **Egresos** (new expense view) tabs. This design mirrors the established Invoice/Payment ports+repo+migration+API pattern exactly, adds a first-of-its-kind `Tabs` primitive (`@base-ui/react`, not Radix), and ships a manual "Crear gasto" form this phase.

`Expense` is architecturally closest to `Payment` **minus** the invoice/customer joins: no `*WithRefs`, no `status`, no `balance`, no `withLock` (there is no read-check-write invariant like overpay protection). Its create path is a plain reusable service function so Phase 3 (Nomina) can insert `category: 'nomina'` rows programmatically without touching the API/UI.

Grounding sources read: `lib/services/ports.ts`, `payment-service.ts`, `invoice-service.ts`, `dashboard-service.ts`, `repositories.ts`, `lib/mock/{store,payment-repo}.ts`, `lib/mock/fixtures/{data,index}.ts`, `lib/db/{payment,invoice}-repo.ts`, `migrations/1700000000000_baseline.sql`, `migrations/1700000001000_add_roles_and_membership.sql`, `app/api/{invoices,payments}/route.ts`, `lib/server/http.ts`, `lib/schemas/{invoice,payment}.ts`, `app/(dashboard)/dashboard/page.tsx` + `components/domain/dashboard/*`, `app/(dashboard)/invoices/new/page.tsx` + `components/domain/invoices/invoice-form*.tsx`, `components/domain/customers/customer-form-dialog.tsx`, `components/ui/select.tsx`, and `node_modules/@base-ui/react/tabs/**` type definitions.

## Goals / Non-Goals

**Goals**: dual-backend `expenses` entity mirroring Payment; reusable `createExpense`/`listExpenses` service; split-function dashboard aggregations for independent Suspense streaming; `/api/expenses` GET+POST; Egresos tab with KPI/by-category/recent + a working "Crear gasto" form; both mock and Postgres backends pass.

**Non-Goals** (per proposal Out of Scope): role-gating (both roles see both tabs; `permissions.ts` untouched), automatic payroll-driven inserts (Phase 3), expense edit/delete, category-specific columns (`employee_id`).

## Architecture Overview

```
UI (Server Components)                    Client shell
  dashboard/page.tsx  ── renders ──►  components/ui/tabs.tsx ("use client")
    ├─ Ingresos subtree (unchanged) ─────► <TabsPanel value="ingresos" keepMounted>
    └─ Egresos subtree (new) ────────────► <TabsPanel value="egresos" keepMounted>
         ├─ ExpenseKpiCards ──────┐
         ├─ ExpensesByCategory ───┤ each in its own <Suspense>
         ├─ RecentExpenses ───────┘
         └─ ExpenseFormDialog ("use client", lazy ssr:false)

Services                     Repos (ports seam)           Backend
  expense-service.ts  ──►  repositories.expenses  ──►  mock/expense-repo.ts
  expense-dashboard-service.ts                          db/expense-repo.ts
                                                        (isDbConfigured switch)
```

All monetary amounts are integer minor units (COP cents), per `ports.ts`'s file-level contract.

---

## 1. Ports (`lib/services/ports.ts`)

Add a new `// Expenses` section after the Payments section. Mirrors `Payment`'s shape minus `invoiceId`/`customerId`/`method`, minus `PaymentWithRefs`, plus a required `category` and `description`.

```ts
// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseCategory = "nomina" | "otro";

/**
 * Repository-facing create payload. Unlike invoices, NOTHING here is
 * server-derived (no number/status/balance), so this doubles as the
 * service's persist type — `businessId` is always a separate argument,
 * never a field, matching Payment's `PaymentInput`.
 */
export type ExpenseInput = {
  category: ExpenseCategory;
  expenseDate: string;
  description: string;
  amount: number;
  notes?: string | null;
};

export type Expense = {
  id: string;
  businessId: string;
  category: ExpenseCategory;
  expenseDate: string;
  description: string;
  amount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseListQuery = {
  category?: ExpenseCategory;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export interface ExpenseRepository {
  list(businessId: string, query: ExpenseListQuery): Promise<Paged<Expense>>;
  /** Scoped by `businessId`; cross-business or missing -> `null`, never leaked (matches PaymentRepository.getById). */
  getById(businessId: string, id: string): Promise<Expense | null>;
  /** Plain insert — no lock, no sequence, no balance invariant. */
  create(businessId: string, data: ExpenseInput): Promise<Expense>;
}
```

**Decision — `ExpenseInput` naming (not `ExpensePersist`/`ExpenseCreate`)**: the proposal floated `ExpenseCreate`/`ExpensePersist`, but the orchestrator's type list and Payment's own convention use `*Input`. Because expenses have zero server-derived fields (contrast `InvoicePersist`, which carries computed `number`/`status`/`subtotal`), a single repo-facing `ExpenseInput` type suffices; there is no derivation step needing a second type. **Rejected**: separate `ExpenseCreate` + `ExpensePersist` — redundant here since the two would be structurally identical.

---

## 2. Migration (`migrations/1700000002000_add_expenses.sql`)

Fake-epoch timestamp `1700000002000` (`+1e9` manual convention, NOT `node-pg-migrate create`'s real `Date.now()`). Mirrors baseline: `TEXT + CHECK` category, `INTEGER` amount, `DATE` date, `idx_<table>_<col>` index.

```sql
-- Up Migration

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  category TEXT NOT NULL CHECK (category IN ('nomina', 'otro')),
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);

-- Down Migration

-- Destructive: only runs on explicit `migrate down`.
DROP TABLE IF EXISTS expenses CASCADE;
```

**Decision — only `idx_expenses_business`**: `category`/`from`/`to` filters are applied in JS after a single business-scoped fetch (exactly how `payment-repo` handles `customerId`/`from`/`to` with no dedicated indexes). Adding `idx_expenses_category` now would be speculative. A real-scale swap-in would replace the fetch-all+filter with SQL aggregates and add indexes then (same note already in `dashboard-service.ts`'s `ALL_ROWS` comment). **Rejected**: `CHECK` via a Postgres `ENUM` type — baseline uses `TEXT + CHECK` everywhere (`profiles.role`, `invoices.status`); stay consistent.

---

## 3. Repositories

### `lib/mock/expense-repo.ts`

Mirrors `payment-repo.ts` structure minus `toPaymentWithRefs`/`withLock`/`simulateLatency` (no async-gap race to prove — create is a single synchronous insert).

```ts
import type { Expense, ExpenseInput, ExpenseListQuery, ExpenseRepository, Paged } from "@/lib/services/ports";
import { generateId, store as defaultStore, type MockStore } from "./store";

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> { /* identical to payment-repo */ }

export function createExpenseRepository(store: MockStore): ExpenseRepository {
  return {
    async getById(businessId, id) {
      const expense = store.expenses.get(id);
      if (!expense || expense.businessId !== businessId) return null; // cross-business/missing -> null
      return expense;
    },
    async list(businessId, query) {
      let expenses = [...store.expenses.values()].filter((e) => e.businessId === businessId);
      if (query.category) expenses = expenses.filter((e) => e.category === query.category);
      if (query.from) expenses = expenses.filter((e) => e.expenseDate >= query.from!);
      if (query.to) expenses = expenses.filter((e) => e.expenseDate <= query.to!);
      expenses.sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : -1)); // newest first, matches payments
      return paginate(expenses, query.page, query.pageSize);
    },
    async create(businessId, data) {
      const now = new Date().toISOString();
      const expense: Expense = {
        id: generateId(),
        businessId, // ALWAYS from arg, never from data
        category: data.category,
        expenseDate: data.expenseDate,
        description: data.description,
        amount: data.amount,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      store.expenses.set(expense.id, expense);
      return expense;
    },
  };
}

export const expenseRepo: ExpenseRepository = createExpenseRepository(defaultStore);
```

### `lib/db/expense-repo.ts`

Mirrors `db/payment-repo.ts`: `ExpenseRow` snake_case type, `toDateStr`, `toExpense` mapper, JS-side filter/sort/paginate, `INSERT ... RETURNING *`.

```ts
import type { Expense, ExpenseInput, ExpenseListQuery, ExpenseRepository, Paged } from "@/lib/services/ports";
import { sql } from "./client";

type ExpenseRow = {
  id: string; business_id: string; category: string; expense_date: string;
  description: string; amount: number; notes: string | null;
  created_at: string; updated_at: string;
};

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    businessId: row.business_id,
    category: row.category as Expense["category"],
    expenseDate: toDateStr(row.expense_date),
    description: row.description,
    amount: Number(row.amount),
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const expenseRepo: ExpenseRepository = {
  async getById(businessId, id) {
    const rows = (await sql`SELECT * FROM expenses WHERE id = ${id}`) as unknown as ExpenseRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return toExpense(row);
  },
  async list(businessId, query) {
    const rows = (await sql`SELECT * FROM expenses WHERE business_id = ${businessId}`) as unknown as ExpenseRow[];
    let expenses = rows.map(toExpense);
    if (query.category) expenses = expenses.filter((e) => e.category === query.category);
    if (query.from) expenses = expenses.filter((e) => e.expenseDate >= query.from!);
    if (query.to) expenses = expenses.filter((e) => e.expenseDate <= query.to!);
    expenses.sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : -1));
    return paginate(expenses, query.page, query.pageSize);
  },
  async create(businessId, data) {
    const rows = (await sql`
      INSERT INTO expenses (id, business_id, category, expense_date, description, amount, notes)
      VALUES (gen_random_uuid(), ${businessId}, ${data.category}, ${data.expenseDate}, ${data.description}, ${data.amount}, ${data.notes ?? null})
      RETURNING *
    `) as unknown as ExpenseRow[];
    return toExpense(rows[0]);
  },
};
```

### `lib/services/repositories.ts`

Add mock + db imports and one ternary line:

```ts
import { expenseRepo as mockExpenseRepo } from "@/lib/mock/expense-repo";
import { expenseRepo as dbExpenseRepo } from "@/lib/db/expense-repo";
// ...
export const repositories = {
  // ...existing...
  expenses: isDbConfigured ? dbExpenseRepo : mockExpenseRepo,
};
```

### `lib/mock/store.ts` (Modified)

- Import `Expense` from ports.
- Add `expenses: Map<string, Expense>` to `MockStore`, `expenses: Expense[]` to `SerializedStore`.
- `serializeStore`: `expenses: [...target.expenses.values()]`.
- `clearStore`: `target.expenses.clear()`.
- `createEmptyStore`: `expenses: new Map()`.
- `hydrateStore`: **`for (const e of data.expenses ?? []) target.expenses.set(e.id, e);`** — the `?? []` is load-bearing (see Risk R4: backward-compat with cookies serialized before this change).

### `lib/mock/fixtures/data.ts` + `index.ts` (Modified)

`data.ts`: add `ExpenseFixture` type + `expenseId(n)` helper (id prefix `60000000-...` — next unused block after invoices' `50000000-...`) + a small `expenseFixtures` array (e.g. 3-4 rows mixing `nomina`/`otro`, `amountInCents`, `dayOffset`). `index.ts` `seedFixtures`: loop `expenseFixtures`, building `Expense` rows scoped to `BUSINESS_ID` with `expenseDate: daysFromNow(fixture.dayOffset)`. **Excluded from `seedMinimal`** (matches invoices/payments/customers — keeps the ~4KB cookie small).

---

## 4. Services

### `lib/services/expense-service.ts` (reusable CRUD)

Thin, honest wrappers over `repositories.expenses`, mirroring `payment-service.ts`. `createExpense` is the reuse point for Phase 3 Nomina.

```ts
import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { Expense, ExpenseInput, ExpenseListQuery, Paged, Session } from "@/lib/services/ports";

export type ExpenseCreateInput = {
  category: ExpenseInput["category"];
  expenseDate: string;
  description: string;
  amount: number;
  notes?: string | null;
};

export async function listExpenses(session: Session, query: ExpenseListQuery): Promise<Paged<Expense>> {
  return repositories.expenses.list(session.businessId, query);
}

export async function getExpense(session: Session, id: string): Promise<Expense> {
  const expense = await repositories.expenses.getById(session.businessId, id);
  if (!expense) throw new ApiError("NOT_FOUND", "Expense not found.");
  return expense;
}

/**
 * Reusable by any caller — the HTTP route AND Phase 3 Nomina (which will call
 * `createExpense(session, { category: "nomina", ... })` when payroll is
 * recorded). `businessId` is ALWAYS `session.businessId`, never client-supplied.
 */
export async function createExpense(session: Session, data: ExpenseCreateInput): Promise<Expense> {
  const persist: ExpenseInput = {
    category: data.category,
    expenseDate: data.expenseDate,
    description: data.description,
    amount: data.amount,
    notes: data.notes ?? null,
  };
  return repositories.expenses.create(session.businessId, persist);
}
```

### `lib/services/expense-dashboard-service.ts` (aggregations)

Copies `dashboard-service.ts`'s split-small-function + `ALL_ROWS`-fetch + JS-aggregation + `Promise.all` composite pattern, so `page.tsx` can wrap each in an independent `<Suspense>`.

```ts
import { repositories } from "@/lib/services/repositories";
import type { Expense, ExpenseCategory, Session } from "@/lib/services/ports";

const ALL_ROWS = Number.MAX_SAFE_INTEGER;
const DEFAULT_RECENT_EXPENSES_LIMIT = 5;

const CATEGORY_META: Record<ExpenseCategory, { label: string }> = {
  nomina: { label: "Nómina" },
  otro: { label: "Otro" },
};
const CATEGORY_ORDER: ExpenseCategory[] = ["nomina", "otro"];

export type ExpensesByCategoryDatum = { category: ExpenseCategory; label: string; total: number };
export type ExpensesSummary = {
  totalThisMonth: number;
  byCategory: ExpensesByCategoryDatum[];
  recentExpenses: Expense[];
};

async function listAllExpenses(session: Session): Promise<Expense[]> {
  const paged = await repositories.expenses.list(session.businessId, { page: 1, pageSize: ALL_ROWS });
  return paged.data;
}

function currentMonthPrefix(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "Gastos del mes": sum of amounts whose `expenseDate` is in the current calendar month. */
export async function getExpensesTotalThisMonth(session: Session, now: Date = new Date()): Promise<number> {
  const expenses = await listAllExpenses(session);
  const prefix = currentMonthPrefix(now);
  return expenses.filter((e) => e.expenseDate.startsWith(prefix)).reduce((sum, e) => sum + e.amount, 0);
}

/** Totals per category, always emitting all categories in fixed order (zeros included), like receivablesByStatus. */
export async function getExpensesByCategory(session: Session): Promise<ExpensesByCategoryDatum[]> {
  const expenses = await listAllExpenses(session);
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    total: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
  }));
}

/** "Gastos recientes": the `limit` most recent expenses, newest first (tiebreak by createdAt), like getRecentPayments. */
export async function getRecentExpenses(session: Session, limit: number = DEFAULT_RECENT_EXPENSES_LIMIT): Promise<Expense[]> {
  const expenses = await listAllExpenses(session);
  return [...expenses]
    .sort((a, b) => {
      if (a.expenseDate !== b.expenseDate) return a.expenseDate < b.expenseDate ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limit);
}

/** Composite for a future `/api/expenses/summary` (not built this phase) — mirrors getDashboardSummary. */
export async function getExpensesSummary(session: Session, now: Date = new Date()): Promise<ExpensesSummary> {
  const [totalThisMonth, byCategory, recentExpenses] = await Promise.all([
    getExpensesTotalThisMonth(session, now),
    getExpensesByCategory(session),
    getRecentExpenses(session),
  ]);
  return { totalThisMonth, byCategory, recentExpenses };
}
```

---

## 5. API + Schema

### `lib/schemas/expense.ts`

Strict zod, mirroring `payment.ts`. `amount` is integer minor units (positive, like payment). `category` is an enum matching the DB CHECK.

```ts
import { z } from "zod";

const DESCRIPTION_MAX = 300;
const NOTES_MAX = 1000;

const dateSchema = z.string().trim().min(1).refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date." });

export const expenseCreateSchema = z
  .object({
    category: z.enum(["nomina", "otro"]),
    expenseDate: dateSchema,
    description: z.string().trim().min(1).max(DESCRIPTION_MAX),
    amount: z.number().positive(),
    notes: z.string().trim().max(NOTES_MAX).optional(),
  })
  .strict();

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
```

### `app/api/expenses/route.ts` (GET + POST)

Mirrors `app/api/invoices/route.ts` exactly (which is the canonical GET+POST route): `withApiHandler`, `requireSession`, `parsePagination`, `checkOrigin` on POST, strict-schema `safeParse`, 201 on create.

```ts
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { expenseCreateSchema } from "@/lib/schemas/expense";
import { requireSession } from "@/lib/session";
import { createExpense, listExpenses } from "@/lib/services/expense-service";
import type { ExpenseCategory, ExpenseListQuery } from "@/lib/services/ports";

const VALID_CATEGORIES: ExpenseCategory[] = ["nomina", "otro"];

function parseCategory(raw: string | null): ExpenseCategory | undefined {
  if (raw === null) return undefined;
  if ((VALID_CATEGORIES as string[]).includes(raw)) return raw as ExpenseCategory;
  throw new ApiError("VALIDATION_ERROR", 'Invalid "category" query parameter.', { category: raw });
}

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: ExpenseListQuery = {
    page,
    pageSize,
    category: parseCategory(searchParams.get("category")),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };
  const result = await listExpenses(session, query);
  return NextResponse.json(
    { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total },
    { status: 200 },
  );
});

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  checkOrigin(request);
  let json: unknown;
  try { json = await request.json(); } catch { throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload."); }
  const parsed = expenseCreateSchema.safeParse(json);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid expense payload.", parsed.error.flatten());
  const expense = await createExpense(session, parsed.data);
  return NextResponse.json({ data: expense }, { status: 201 });
});
```

---

## 6. Dashboard Tabs Restructure (highest-risk section)

### `components/ui/tabs.tsx` (New — first Tabs use in this repo)

`@base-ui/react/tabs` parts (verified against `node_modules/@base-ui/react/tabs/**/*.d.ts`): `Tabs.Root`, `Tabs.List`, `Tabs.Tab` (value-based, renders `<button>`), `Tabs.Panel` (value-based, renders `<div>`; **`keepMounted` defaults to `false`**), `Tabs.Indicator`. Root is `value`/`defaultValue`-controlled with `TabsTab.Value = any | null` and `defaultValue` default `0`. This is the same trigger/panel + value-controlled model as `select.tsx`. Wrapper mirrors `select.tsx`'s `data-slot` + `cn(...)` conventions:

```tsx
"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex w-fit items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm",
        className,
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={cn("flex flex-col gap-4 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTab, TabsPanel }
```

> Note for apply: confirm the selected-state attribute base-ui emits on `Tabs.Tab` (`data-selected` vs `data-active`) against `tabs/tab/TabsTabDataAttributes.d.ts` and adjust the `data-[selected]:*` classes if needed. This is cosmetic only — it does not affect the streaming mechanics below. Names `TabsTab`/`TabsPanel` intentionally track base-ui's part names (not shadcn/Radix's `TabsTrigger`/`TabsContent`), matching how `select.tsx` stayed close to base-ui.

### `app/(dashboard)/dashboard/page.tsx` (Modified — stays a Server Component)

The page remains a plain (non-`"use client"`) async-free Server Component. It renders the client `<Tabs>` shell and passes **server-rendered subtrees as panel children**. The two existing header quick actions (Crear cliente / Crear factura) stay in the page header as global/Ingresos-oriented actions; the new "Crear gasto" action lives inside the Egresos panel (tab-local).

```tsx
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
// ...existing dashboard-section + Button/Link imports...
// + Egresos components (section 8) and ExpenseFormDialog (section 7)

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* header (title + Crear cliente / Crear factura) — UNCHANGED */}

      <Tabs defaultValue="ingresos">
        <TabsList>
          <TabsTab value="ingresos">Ingresos</TabsTab>
          <TabsTab value="egresos">Egresos</TabsTab>
        </TabsList>

        <TabsPanel value="ingresos" keepMounted>
          {/* EXISTING Ingresos subtree, moved here verbatim: KpiCards, DashboardCharts,
              OverdueList + TopDebtors grid, RecentPayments — each still in its own <Suspense> */}
        </TabsPanel>

        <TabsPanel value="egresos" keepMounted>
          <div className="flex items-center justify-end">
            <ExpenseFormDialog trigger={<Button>Crear gasto</Button>} />
          </div>
          <Suspense fallback={<ExpenseKpiCardsSkeleton />}><ExpenseKpiCards /></Suspense>
          <Suspense fallback={<ExpensesByCategorySkeleton />}><ExpensesByCategory /></Suspense>
          <Suspense fallback={<RecentExpensesSkeleton />}><RecentExpenses /></Suspense>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
```

### Why server-side streaming survives the client Tabs wrapper (the mechanic, spelled out)

1. **RSC composition**: a Server Component (`page.tsx`) may pass other Server Components as `children`/props to a Client Component (`Tabs`/`TabsPanel`). React renders those subtrees **on the server**, serializes them into the RSC payload (including their `<Suspense>` boundaries), and the Client Component simply places them where `{children}` appears. The client never imports or re-executes the server subtree — it only positions already-rendered output. This is the exact pattern the proposal recommends and it is mechanically sound.

2. **Independent Suspense streaming is preserved** because the boundaries live *inside* the server subtrees, not inside the client component. Each Egresos section (`ExpenseKpiCards`, etc.) streams in independently, identically to how the current Ingresos sections do — the Tabs wrapper is transparent to Suspense.

3. **`keepMounted` is REQUIRED on both panels** (base-ui default is `false`). This is the single load-bearing prop:
   - With `keepMounted`, base-ui renders **both** panels' children into the DOM on first load (the inactive one gets a `hidden` attribute / `data-[hidden]` state), so **both tabs' Server subtrees render and stream on initial page load** — this realizes the proposal's "eager-fetch both tabs" recommendation, matching the app's "render everything, let Suspense stream" philosophy and modest MVP data volumes.
   - Switching tabs is then pure client-side show/hide (CSS), with **no client-side refetch** and no loss of the streamed content.
   - Without `keepMounted`, base-ui early-returns `null` for the inactive panel on the client; the server-rendered inactive DOM would be discarded on hydration and re-created (losing streamed state) only when the tab is first activated. That is the failure mode Risk R1 guards against — hence `keepMounted` is mandatory, not optional.

4. **No `"use client"` creep**: `page.tsx` and all data-fetching section components stay Server Components. Only `tabs.tsx` (and the lazy `ExpenseFormDialog`) are client. We never import a Server Component *into* a client module — we only pass it as children. This keeps the ports/streaming architecture intact.

**Rejected alternative — lazy client-side fetch on tab activation** (only fetch Egresos when its tab is clicked): would require a client data-fetching path (`/api/expenses` from the browser) parallel to the Server Component path, contradicting the app's server-first streaming model and duplicating logic. The proposal explicitly prefers eager-fetch; MVP data volume makes lazy loading premature optimization.

---

## 7. "Crear gasto" Form

**Decision — a lazy dialog in the Egresos tab, NOT a dedicated `/dashboard/expenses/new` page.** The dashboard already establishes both UX patterns: "Crear cliente" is a one-click **dialog** (`customer-form-dialog.tsx`, `dynamic ssr:false`) and "Crear factura" links to a **dedicated page** (heavy line-item form). The expense form is simple (4 fields: category, description, amount, date) — structurally like the customer form, not the invoice form — and there is no standalone expenses list page in this change, only the Egresos tab. So the dialog pattern fits best and keeps the create action co-located with the Egresos data it mutates. **Rejected**: dedicated `/dashboard/expenses/new` page — over-built for 4 fields and would need a new route with nothing else on it; reserve that for a future full expenses list screen.

Component structure (mirrors `customer-form-dialog.tsx` + `invoice-form-content.tsx`):

- **`components/domain/dashboard/expense-form-dialog.tsx`** — thin `"use client"` `dynamic(() => import("./expense-form-dialog-content"), { ssr: false })` wrapper, re-exporting the content's prop type. Server components import this file directly. Accepts a `trigger` prop (like `CustomerFormDialog`).
- **`components/domain/dashboard/expense-form-dialog-content.tsx`** — the real dialog: `react-hook-form` + `zodResolver` (the app's verified form stack), fields:
  - `category` — a `<select>` (native, as `invoice-form-content.tsx` uses for customer) with `nomina`/`otro` options, or the `components/ui/select.tsx` primitive; native `<select>` is the lower-risk match for the existing invoice form.
  - `description` — `Input`.
  - `amount` — `Input type="number"` entered in **whole COP pesos**, converted to integer cents (`Math.round(value * 100)`) at submit, exactly like `invoice-form-content.tsx`'s `unitPrice` convention.
  - `expenseDate` — `Input type="date"`, default `todayIsoDate()`.
  - Optional `notes` — `Textarea`.
  - On submit: `POST /api/expenses` with the cents-converted payload; on success close the dialog and `router.refresh()` so the Egresos Server Components (`ExpenseKpiCards`/`ExpensesByCategory`/`RecentExpenses`) re-stream with the new row. On non-OK, surface `body.error.message` like the invoice form.
- **`components/domain/dashboard/expense-form-schema.ts`** — client-side form schema (pesos-based `amount`, string dates), distinct from `lib/schemas/expense.ts` (cents-based, server boundary), matching the invoice form's `invoice-form-schema.ts` vs `lib/schemas/invoice.ts` split.

---

## 8. Egresos Display Components

Each is a standalone async Server Component doing `await loadStoreFromCookie()` + `requireSession()` + one `expense-dashboard-service` call, plus an exported `*Skeleton` — copying `kpi-cards.tsx` / `recent-payments.tsx` verbatim in shape.

- **`components/domain/dashboard/expense-kpi-cards.tsx`** → `ExpenseKpiCards` + `ExpenseKpiCardsSkeleton`. Calls `getExpensesTotalThisMonth`. Renders a "Gastos del mes" `Card` with `<MoneyAmount cents={...} size="lg" />`, mirroring `kpi-cards.tsx`. (Could add a second card for total-count; single KPI card is enough for MVP.)
- **`components/domain/dashboard/expenses-by-category.tsx`** → `ExpensesByCategory` + `ExpensesByCategorySkeleton`. Calls `getExpensesByCategory`. Renders a `Card` with a lightweight two-row breakdown (Nómina / Otro, each label + `MoneyAmount`) — **per the proposal's resolved assumption: no new chart type**, just a KPI-style breakdown. `<MoneyAmount>` and `Card` are the reused primitives.
- **`components/domain/dashboard/recent-expenses.tsx`** → `RecentExpenses` + `RecentExpensesSkeleton`. Calls `getRecentExpenses`. Renders a `Card` + `Table` with columns **Fecha / Categoría / Descripción / Monto**, mirroring `recent-payments.tsx` (including the empty-state row "Sin gastos registrados."). Category cell shows the Spanish label ("Nómina"/"Otro").

Empty-state (Egresos for a `seedMinimal` business with no expenses): zeros + empty lists, identical treatment to the existing dashboard sections (proposal's resolved low-stakes assumption).

---

## Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | Client `<Tabs>` wrapper breaks server-side Suspense streaming | Med→Low | Pass Server subtrees as `children` (never import server comps into the client module); set **`keepMounted` on both panels** so both stream eagerly on load and tab-switch is CSS-only. Fully specified in §6. |
| R2 | base-ui Tabs API differs from Radix/shadcn assumptions | Med→Low | Verified against `node_modules/@base-ui/react/tabs/**/*.d.ts`: parts are `Root/List/Tab/Panel`, value-controlled, `keepMounted` default `false`. `tabs.tsx` given concretely in §6. Apply must still confirm the selected-state data-attribute (`data-selected` vs `data-active`) for cosmetics only. |
| R3 | `"nomina"` category tempts premature admin-gating | Med | Add the two category values only; `permissions.ts` and role-gating stay untouched this phase (Out of Scope). No runtime consumer of `category === 'nomina'` beyond aggregation labels. |
| R4 | `hydrateStore` throws on cookies serialized before `expenses` existed (missing field) | Med | Use `for (const e of data.expenses ?? [])` in `hydrateStore` — the `?? []` makes old cookies forward-compatible. Called out in §3. |
| R5 | Migration numbering diverges from the manual fake-epoch convention | Low | Use `1700000002000` (`+1e9`), not `node-pg-migrate create`'s real `Date.now()`. |
| R6 | Cookie-persistence path bloats past ~4KB as expenses accumulate | Low | Expenses excluded from `seedMinimal` (cookie path starts empty); user-created rows are few and additive, same as invoices/payments already in the cookie. |

## Migration / Rollback

Additive-only: new files plus isolated edits to `ports.ts`, `store.ts`, `fixtures/*`, `repositories.ts`, and `dashboard/page.tsx`. Ingresos and all invoice/payment paths are untouched, so a revert cannot regress income features. Rollback = revert the PR + run migration Down (`DROP TABLE expenses CASCADE`).

## Open Questions (low-stakes, deferred to apply)

- Exact base-ui selected-state data-attribute for `Tabs.Tab` styling (R2) — cosmetic.
- Whether `ExpensesByCategory` shows a bar (reuse recharts) or a plain two-row list — proposal assumption favors the plain list; either satisfies success criteria.
- Whether the manual "Crear gasto" form should offer `nomina` as a selectable category or restrict manual entry to `otro` — design allows both (schema permits both); restricting is a one-line enum change if product prefers.
