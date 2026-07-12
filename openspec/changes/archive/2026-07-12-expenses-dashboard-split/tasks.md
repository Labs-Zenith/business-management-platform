# Tasks: Expenses Tracking + Dashboard Ingresos/Egresos Split

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1100 (migration ~20, ports ~50, mock+db repos ~90, repositories/store/fixtures wiring ~60, services ~105, schema+route ~75, tabs primitive ~50, dashboard page restructure ~60, Egresos display components ~100, Crear-gasto dialog ~135, tests ~360) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (data/service layer: migration + ports + repos + services + API route) → PR 2 (dashboard Tabs + Egresos display) → PR 3 (Crear gasto dialog) |
| Delivery strategy | ask-on-risk (default; not overridden this session) |
| Chain strategy | feature-branch-chain (recommended, matching `roles-multi-business`'s 3-PR precedent; ask user to confirm before apply) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migration + ports + dual-backend repos + store/fixtures wiring + `expense-service`/`expense-dashboard-service` + `/api/expenses` route, fully unit-tested (mock + db) | PR 1 | Base = feature/tracker branch. Self-contained backend slice; no UI changes; both backends independently testable. Largest and highest-risk-of-budget-overrun unit — consider splitting further into 1a (migration+ports+repos+store) / 1b (services+route+tests) if a single reviewer pass would exceed ~500 lines. |
| 2 | `components/ui/tabs.tsx` + dashboard page restructure (Ingresos/Egresos `Tabs`, `keepMounted` on both panels) + Egresos display components (KPI/by-category/recent) | PR 2 | Base = PR 1 branch. Depends on PR 1's `expense-dashboard-service` exports. Highest UI/streaming risk (R1/R2 from design) — verify `keepMounted` and base-ui data-attributes here. |
| 3 | "Crear gasto" dialog (schema + content + lazy wrapper) wired into the Egresos panel | PR 3 | Base = PR 2 branch. Depends on PR 1's `/api/expenses` POST and PR 2's Egresos panel existing to mount the trigger button. |

## Phase 1: Database Migration (Foundation)

- [x] 1.1 Create `migrations/1700000002000_add_expenses.sql` (fake-epoch `+1e9`, NOT `node-pg-migrate create`'s real timestamp). Up: `CREATE TABLE IF NOT EXISTS expenses` (`id UUID PK`, `business_id UUID NOT NULL REFERENCES businesses(id)`, `category TEXT NOT NULL CHECK (category IN ('nomina','otro'))`, `expense_date DATE NOT NULL`, `description TEXT NOT NULL`, `amount INTEGER NOT NULL`, `notes TEXT`, `created_at`/`updated_at TIMESTAMPTZ DEFAULT now()`) + `CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id)`. Down: `DROP TABLE IF EXISTS expenses CASCADE`.

## Phase 2: Ports & Types (Foundation)

- [x] 2.1 `lib/services/ports.ts`: add `ExpenseCategory = "nomina" | "otro"`, `ExpenseInput` (repo-facing create payload — no server-derived fields, `businessId` always a separate arg), `Expense`, `ExpenseListQuery` (`category?`, `from?`, `to?`, `page`, `pageSize`), `ExpenseRepository` (`list`, `getById`, `create`) per design.md section 1.

## Phase 3: Repositories & Store

- [x] 3.1 Create `lib/mock/expense-repo.ts`: `createExpenseRepository(store)` mirroring `payment-repo.ts` minus `toPaymentWithRefs`/`withLock`/`simulateLatency`; `getById` scoped by `businessId` (cross-business/missing → `null`); `list` filters `category`/`from`/`to` in JS, sorts newest-first; `create` always takes `businessId` from the arg, never from `data`. Export default `expenseRepo` bound to `defaultStore`.
- [x] 3.2 Create `lib/db/expense-repo.ts`: `ExpenseRow` snake_case type + `toExpense` mapper; `list`/`getById` fetch business-scoped rows then filter/sort in JS (matching `payment-repo.ts`, no speculative indexes); `create` via `INSERT ... RETURNING *`.
- [x] 3.3 `lib/services/repositories.ts`: import both `expenseRepo`s, add `expenses: isDbConfigured ? dbExpenseRepo : mockExpenseRepo`.
- [x] 3.4 `lib/mock/store.ts`: add `expenses: Map<string, Expense>` to `MockStore` / `expenses: Expense[]` to `SerializedStore`; wire into `serializeStore`, `clearStore`, `createEmptyStore`; in `hydrateStore` use `for (const e of data.expenses ?? []) target.expenses.set(e.id, e);` — the `?? []` is REQUIRED for backward-compat with cookies serialized before this change (design Risk R4).
- [x] 3.5 `lib/mock/fixtures/data.ts`: add `ExpenseFixture` type, `expenseId(n)` helper (id prefix `60000000-...`, next unused block after invoices' `50000000-...`), and a small `expenseFixtures` array (3-4 rows mixing `nomina`/`otro`).
- [x] 3.6 `lib/mock/fixtures/index.ts`: `seedFixtures` loops `expenseFixtures` into `Expense` rows scoped to `BUSINESS_ID`; confirm `seedMinimal` does NOT seed expenses (matches invoices/payments/customers).

## Phase 4: Services

- [x] 4.1 Create `lib/services/expense-service.ts`: `listExpenses(session, query)`, `getExpense(session, id)` (throws `ApiError("NOT_FOUND", ...)` if missing), `createExpense(session, data: ExpenseCreateInput)` (builds `ExpenseInput`, `businessId` ALWAYS `session.businessId`) — the reuse point for future Nomina auto-inserts.
- [x] 4.2 Create `lib/services/expense-dashboard-service.ts`: `listAllExpenses` (`ALL_ROWS` fetch), `getExpensesTotalThisMonth(session, now?)`, `getExpensesByCategory(session)` (fixed `nomina`/`otro` order, zeros included), `getRecentExpenses(session, limit?)` (newest-first, `createdAt` tiebreak), `getExpensesSummary(session, now?)` (`Promise.all` composite) — mirrors `dashboard-service.ts`'s split-function style for independent Suspense streaming.

## Phase 5: API + Schema

- [x] 5.1 Create `lib/schemas/expense.ts`: strict zod `expenseCreateSchema` (`category` enum, `expenseDate` date-string, `description` max 300, `amount` positive integer minor-units, optional `notes` max 1000).
- [x] 5.2 Create `app/api/expenses/route.ts`: `GET` — `requireSession`, `parsePagination`, `parseCategory` query-param guard (rejects invalid values with `VALIDATION_ERROR`), calls `listExpenses`; `POST` — `checkOrigin`, JSON parse guard, `expenseCreateSchema.safeParse`, calls `createExpense`, 201 response. Mirrors `app/api/invoices/route.ts` exactly.

## Phase 6: Tabs Primitive (First-Time Component)

- [x] 6.1 Run `shadcn add tabs` (or hand-write) to create `components/ui/tabs.tsx` wrapping `@base-ui/react/tabs` (`Root`/`List`/`Tab`/`Panel`), `data-slot` + `cn(...)` conventions matching `select.tsx`.
- [x] 6.2 Verify against `node_modules/@base-ui/react/tabs/**/*.d.ts` (NOT just trust design.md): confirm part names, `Tabs.Panel`'s `keepMounted` default (`false`), and the actual selected-state data-attribute (`data-selected` vs `data-active`) emitted on `Tabs.Tab`; adjust the `data-[selected]:*`/`data-[active]:*` classes to match reality. **Confirmed: `data-active` (not `data-selected`)** — see `tabs/tab/TabsTabDataAttributes.d.ts`; `tabs.tsx` uses `data-[active]:*` classes.

## Phase 7: Dashboard Restructure

- [x] 7.1 `app/(dashboard)/dashboard/page.tsx`: wrap content in `<Tabs defaultValue="ingresos">` + `<TabsList>` (Ingresos/Egresos tabs); move the existing Ingresos subtree verbatim into `<TabsPanel value="ingresos" keepMounted>` (unchanged behavior/markup); add `<TabsPanel value="egresos" keepMounted>` for the new Egresos content. **`keepMounted` MUST be set on both panels** — omitting it discards the inactive panel's streamed server subtree on hydration (design Risk R1).
- [x] 7.2 Confirm the page stays a plain Server Component (no `"use client"`) and that Egresos section components are passed as children/props, never imported into the client `tabs.tsx` module.

## Phase 8: Egresos Display Components

- [x] 8.1 Create `components/domain/dashboard/expense-kpi-cards.tsx`: `ExpenseKpiCards` (async Server Component, `getExpensesTotalThisMonth`) + `ExpenseKpiCardsSkeleton`, mirroring `kpi-cards.tsx`.
- [x] 8.2 Create `components/domain/dashboard/expenses-by-category.tsx`: `ExpensesByCategory` (`getExpensesByCategory`, two-row Nómina/Otro breakdown, no new chart type) + `ExpensesByCategorySkeleton`.
- [x] 8.3 Create `components/domain/dashboard/recent-expenses.tsx`: `RecentExpenses` (`getRecentExpenses`, Table columns Fecha/Categoría/Descripción/Monto, empty-state row "Sin gastos registrados.") + `RecentExpensesSkeleton`, mirroring `recent-payments.tsx`.
- [x] 8.4 Wire all three into the Egresos `TabsPanel` from 7.1, each in its own `<Suspense>` boundary.

## Phase 9: "Crear Gasto" Dialog

- [x] 9.1 Create `components/domain/dashboard/expense-form-schema.ts`: client-side pesos-based form schema (distinct from `lib/schemas/expense.ts`'s cents-based server schema), mirroring `invoice-form-schema.ts`.
- [x] 9.2 Create `components/domain/dashboard/expense-form-dialog-content.tsx`: `react-hook-form` + `zodResolver`, fields category (select), description (Input), amount (Input type="number", pesos→cents via `Math.round(value * 100)`), expenseDate (Input type="date", default `todayIsoDate()`), optional notes (Textarea). On submit: `POST /api/expenses`; success closes dialog and calls `router.refresh()` so Egresos Server Components re-stream; failure surfaces `body.error.message`.
- [x] 9.3 Create `components/domain/dashboard/expense-form-dialog.tsx`: thin `"use client"` `dynamic(..., { ssr: false })` wrapper re-exporting the content's prop type, accepting a `trigger` prop — mirrors `customer-form-dialog.tsx`.
- [x] 9.4 Wire `<ExpenseFormDialog trigger={<Button>Crear gasto</Button>} />` into the Egresos `TabsPanel` (from 7.1/8.4).

## Phase 10: Tests

- [x] 10.1 `lib/mock/expense-repo.test.ts`: business-scoped `getById`/`list` isolation, `category`/`from`/`to` filtering, pagination, `create` ignores any `businessId` on `data`.
- [x] 10.2 `lib/db/expense-repo.test.ts`: mock `sql` client, assert row-mapping, filter/sort behavior, `INSERT ... RETURNING *` shape — mirrors `lib/db/payment-repo.test.ts`.
- [x] 10.3 `lib/services/expense-service.test.ts`: `createExpense` derives `businessId` from session only; `getExpense` throws `NOT_FOUND` for missing/cross-business id.
- [x] 10.4 `lib/services/expense-dashboard-service.test.ts`: `getExpensesTotalThisMonth` filters by calendar month; `getExpensesByCategory` always emits both categories (zeros included); `getRecentExpenses` sort/limit/tiebreak.
- [x] 10.5 `app/api/expenses/expenses-route.test.ts`: 200 list with filters, cross-business isolation, 201 create, `VALIDATION_ERROR` on bad category/amount/date, `checkOrigin` enforcement on POST — mirrors `invoices-route.test.ts`.
- [x] 10.6 `lib/mock/store.test.ts`: regression test — `hydrateStore` on a payload missing the `expenses` field does not throw (Risk R4).
- [x] 10.7 `components/ui/tabs.test.tsx`: both panels' content is present in the DOM on initial render (`keepMounted` behavior); switching tabs shows/hides without unmounting. **Implemented as `app/(dashboard)/dashboard/page.test.tsx` instead of a standalone `tabs.test.tsx`** — no `components/ui/*` primitive has its own dedicated test file in this codebase (checked `select.tsx` and siblings: none), so per that established convention this is verified through its real consumer (the dashboard page) using the actual `Tabs`/`TabsPanel` components (not mocked), proving both Ingresos and Egresos content are simultaneously present in the DOM and that clicking the Egresos tab does not unmount the Ingresos content.
- [x] 10.8 `components/domain/dashboard/expense-form-dialog-content.test.tsx`: valid submission POSTs cents-converted payload and calls `router.refresh()`; invalid amount/missing field blocks submission client-side; server error surfaces the message.

## Phase 11: Verification Gate

- [x] 11.1 `npm run typecheck`
- [x] 11.2 `npm run lint`
- [x] 11.3 `npm run test`
- [x] 11.4 `npm run build`
