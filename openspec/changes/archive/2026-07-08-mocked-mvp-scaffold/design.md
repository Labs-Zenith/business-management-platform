# Design: Mocked MVP Scaffold (Fase 1, ports-and-adapters)

## Technical Approach

Net-new Next.js 15 App Router + TS + React 19 (npm) project. Four concentric layers per
`docs/technical-architecture.md`: **UI** (React/shadcn, display-only) → **Validation** (Zod, `lib/schemas`)
→ **Service** (business logic, `lib/services`) → **Data-access** (ports interfaces implemented today by an
in-memory mock, `lib/mock`). UI and services depend **only** on `lib/services/ports.ts` types; nothing outside
`lib/mock` and `lib/services/repositories.ts` imports the mock. Swapping to real Supabase later = rewrite two
files. Money is integer minor units end-to-end; formatting happens only at UI edges. OpenAPI is derived from the
same Zod schemas so spec drift is impossible.

## File & Folder Layout

```text
app/
  layout.tsx                         root layout (fonts, Toaster)
  (auth)/
    layout.tsx                       centered card shell (no nav)
    login/page.tsx                   Login screen (client form -> POST /api/auth/login)
  (dashboard)/
    layout.tsx                       app shell: sidebar (desktop) / bottom-nav (mobile)
    dashboard/page.tsx               Dashboard KPIs (server component)
    dashboard/loading.tsx            Skeleton
    customers/page.tsx               Clientes list + search
    customers/loading.tsx            Skeleton
    customers/[id]/page.tsx          Detalle de cliente (financial summary)
    customers/[id]/loading.tsx       Skeleton
    invoices/page.tsx                Facturas list + filters
    invoices/loading.tsx             Skeleton
    invoices/new/page.tsx            Crear factura (hosts dynamic invoice-items form)
    invoices/[id]/page.tsx           Detalle de factura (+ payment dialog, print link)
    invoices/[id]/loading.tsx        Skeleton
    payments/page.tsx                Pagos list
    payments/loading.tsx             Skeleton
    settings/page.tsx                Negocio (read-only business profile)
  (print)/
    layout.tsx                       minimal print-friendly shell (no nav, print CSS)
    invoices/[id]/receipt/page.tsx   Comprobante imprimible (DIAN legal notice)
  api/
    auth/login/route.ts              POST  set httpOnly session cookie
    auth/logout/route.ts             POST  clear cookie
    customers/route.ts               GET list, POST create
    customers/[id]/route.ts          GET detail, PATCH update
    invoices/route.ts                GET list, POST create
    invoices/[id]/route.ts           GET detail
    invoices/[id]/payments/route.ts  POST register payment
    payments/route.ts                GET list
    dashboard/summary/route.ts       GET summary
    openapi.json/route.ts            GET OpenAPI 3 document
    docs/page.tsx                    Scalar API reference (dynamic, ssr:false)
middleware.ts                        guards (dashboard)/(print)/api/docs -> /login
components/
  ui/                                shadcn primitives (button, card, table, dialog, skeleton, badge, input, form, sonner...)
  layout/{app-sidebar,mobile-nav,page-header}.tsx
  domain/
    customer-form-dialog.tsx         dynamic ssr:false
    invoice-item-fields.tsx          useFieldArray; dynamic ssr:false
    payment-form-dialog.tsx          dynamic ssr:false
    invoice-status-badge.tsx
    kpi-card.tsx
    money.tsx                        <Money value={cents}/> wraps formatCOP
lib/
  money.ts                           minor-unit math: roundHalfUp, mulQuantity, formatCOP (UI-only)
  session.ts                         requireSession() server helper (throws UNAUTHENTICATED)
  schemas/{customer,invoice,payment,common,dashboard}.ts   Zod (strict) + inferred types
  services/
    ports.ts                         repository + AuthPort interfaces (the seam)
    repositories.ts                  single swap point: wires mock impls
    customer-service.ts
    invoice-service.ts
    payment-service.ts
    dashboard-service.ts
    status.ts                        computeStatus(total, paid, dueDate, now)
  mock/
    store.ts                         globalThis-cached in-memory singleton + per-business seq counters
    lock.ts                          keyed async mutex (promise-chain)
    customer-repo.ts / invoice-repo.ts / payment-repo.ts / business-repo.ts / auth-adapter.ts
    fixtures/{business,users,customers,invoices,payments}.ts   seed: 1 business, 1 user, ~8 customers, ~12 invoices (all 4 statuses), several payments
  server/
    api-error.ts                     ApiError class -> {error:{code,message,details}}
    http.ts                          withApiHandler(): try/catch, no-store, pagination parse
    origin-check.ts                  Origin/Referer vs APP_ORIGIN on mutations
  openapi/{registry.ts,document.ts}  zod-to-openapi single source of truth
.env.example                         NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, APP_ORIGIN
```

## Ports-and-Adapters Seam (`lib/services/ports.ts`)

```ts
export type Session = { userId: string; businessId: string; email: string };

export interface AuthPort {
  getSession(): Promise<Session | null>;             // reads/validates httpOnly cookie
  signIn(email: string, password: string): Promise<Session | null>;
  signOut(): Promise<void>;
}
export interface CustomerRepository {
  list(businessId: string, f: CustomerListQuery): Promise<Paged<CustomerWithBalance>>;
  getById(businessId: string, id: string): Promise<CustomerDetail | null>;
  create(businessId: string, data: CustomerCreate): Promise<Customer>;
  update(businessId: string, id: string, data: CustomerUpdate): Promise<Customer | null>;
}
export interface InvoiceRepository {
  list(businessId: string, f: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>>;
  getById(businessId: string, id: string): Promise<InvoiceDetail | null>;
  create(businessId: string, data: InvoicePersist): Promise<InvoiceDetail>; // atomic numbering+insert
}
export interface PaymentRepository {
  list(businessId: string, f: PaymentListQuery): Promise<Paged<PaymentWithRefs>>;
  createForInvoice(businessId: string, invoiceId: string, data: PaymentInput): Promise<InvoiceDetail>; // locked, overpay-rejecting
}
export interface BusinessRepository { getById(businessId: string): Promise<Business | null>; }
```

`repositories.ts` is the **only** wiring file:
```ts
export const repositories = { customers: mockCustomerRepo, invoices: mockInvoiceRepo,
  payments: mockPaymentRepo, business: mockBusinessRepo, auth: mockAuthAdapter };
```

Mock store survives Next dev HMR via globalThis:
```ts
const g = globalThis as unknown as { __store?: MockStore };
export const store = g.__store ?? (g.__store = seedStore()); // seq counters keyed by businessId
```
`lock.ts` exposes `withLock(key, fn)` — a per-key promise chain guaranteeing mutual exclusion across `await`
points. Invoice creation locks on `businessId` (numbering); payment locks on `invoiceId` (balance).

## Money Handling

All persisted/service amounts are **integer minor units (COP cents)**. `unit_price` and `amount` are cents;
`quantity` may be fractional (numeric(12,2)). The single rounding site is `line_total`:
```ts
// lib/money.ts
export const roundHalfUp = (n: number) => Math.floor(n + 0.5);
export const lineTotal = (quantityMilli: number, unitPriceCents: number) =>
  roundHalfUp((quantityMilli * unitPriceCents) / 1000); // quantity carried as milli-units, integer-safe
export const formatCOP = (cents: number) =>
  new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(cents/100);
```
`subtotal = total = Σ lineTotal`. `formatCOP` is imported **only** by `components/**` (via `<Money/>`); services,
schemas, and mock never format. Maps cleanly to future `numeric(12,2)` (divide by 100 on the seam).

## Sequence — Invoice Creation (safety-critical)

```mermaid
sequenceDiagram
  participant C as Client
  participant R as route.ts (withApiHandler)
  participant S as invoice-service
  participant IR as InvoiceRepository (mock)
  C->>R: POST /api/invoices {customerId,issueDate,dueDate,items,notes}
  R->>R: originCheck() + requireSession() -> businessId
  R->>R: invoiceCreateSchema.parse (strict: rejects number/status/totals/business_id)
  R->>S: create(businessId, dto)
  S->>S: customerRepo.getById(businessId,customerId) -> else NOT_FOUND
  S->>S: per item lineTotal=roundHalfUp(qty*unitPrice); subtotal=total=Σ
  S->>S: status = computeStatus(total, paid=0, dueDate, now)
  S->>IR: create(businessId, {items+lineTotals, subtotal, total, status})
  IR->>IR: withLock(businessId): number=nextSeq(businessId); persist invoice+items atomically
  IR-->>S: InvoiceDetail
  S-->>R: invoice
  R-->>C: 201 + Cache-Control:no-store
```

## Sequence — Payment Registration (safety-critical, overpay race)

```mermaid
sequenceDiagram
  participant C as Client
  participant R as payments/route.ts
  participant P as payment-service
  participant PR as PaymentRepository (mock)
  C->>R: POST /api/invoices/{id}/payments {paymentDate,amount,method,notes}
  R->>R: originCheck() + requireSession() -> businessId
  R->>R: paymentCreateSchema.parse (strict: rejects customerId/business_id/status)
  R->>P: register(businessId, invoiceId, dto)
  P->>PR: createForInvoice(businessId, invoiceId, dto)
  PR->>PR: withLock(invoiceId) { ... read-check-write under single holder ... }
  Note over PR: invoice=find(businessId,invoiceId) else NOT_FOUND<br/>paid=Σ payments; balance=total-paid<br/>if amount>balance -> throw ApiError(VALIDATION_ERROR) NO mutation<br/>customerId=invoice.customerId (derived, never client)<br/>insert payment; status=computeStatus(total,paid+amount,dueDate)
  PR-->>P: updated InvoiceDetail
  P-->>R: invoice
  R-->>C: 201 + no-store  (or 400 with {error:{code,message}})
```

## Auth / Session

Mock `POST /api/auth/login` validates email/password against the single seeded demo user, then sets an opaque
`session` cookie: `httpOnly, sameSite=lax, path=/, secure` (prod). `logout` clears it. `middleware.ts` matches
`(dashboard)`, `(print)`, and `/api/docs`; missing/invalid cookie → 302 `/login`. **Defense in depth** per
`docs/security-plan.md` ("cada endpoint debe validar sesion"): every API route ALSO calls `requireSession()`
(`lib/session.ts` → `AuthPort.getSession()`), which throws `ApiError(UNAUTHENTICATED)` — middleware is a
convenience, not the authorization boundary. `businessId` is always taken from the resolved Session, never the
payload.

## Skeleton vs. dynamic()

| Surface | Strategy | Why |
|---|---|---|
| dashboard, customers, customers/[id], invoices, invoices/[id], payments | server component + `loading.tsx` + shadcn `Skeleton` via Suspense | data reads hit mock simulated latency; streamed skeletons |
| Scalar API reference (`api/docs/page.tsx`) | `next/dynamic(..., { ssr:false })` | Scalar's `@scalar/api-reference-react` is browser-oriented; render client-only to sidestep any React 19 SSR hydration issue (the reason Scalar replaced swagger-ui-react). Verify at apply: if it SSRs cleanly, keep dynamic anyway for bundle isolation |
| invoice-item-fields (`useFieldArray`) | `dynamic(..., ssr:false)` | heavy interactive client form, no SSR value |
| payment-form-dialog, customer-form-dialog | `dynamic(..., ssr:false)` | modal-triggered; code-split out of first paint |

## API / OpenAPI Layer

`lib/openapi/registry.ts` builds an `OpenAPIRegistry` (`@asteasolutions/zod-to-openapi`); every schema in
`lib/schemas/*` is registered with `.openapi()` metadata. `document.ts` calls
`OpenApiGeneratorV3(registry.definitions).generateDocument(...)` → OpenAPI 3 doc (auth security scheme, request/
response schemas, common errors, customers/invoices/payments/dashboard paths). `api/openapi.json/route.ts` returns
it (session-gated, no secrets). `api/docs/page.tsx` renders Scalar pointed at `/api/openapi.json`. Zod is the
single source of truth → spec cannot drift from validation.

## Error Handling & Conventions

- `lib/server/api-error.ts`: `class ApiError extends Error { code; status; details? }` serialized as
  `{error:{code,message,details}}`; codes `UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|VALIDATION_ERROR|CONFLICT|INTERNAL_ERROR`.
- `lib/server/http.ts`: `withApiHandler(fn)` wraps every route — try/catch mapping `ApiError`→status, `ZodError`→
  `VALIDATION_ERROR` 400, unknown→`INTERNAL_ERROR` 500 (redacted); sets `Cache-Control: no-store` on all responses;
  parses `page`/`pageSize` (min 1, max 50) for list routes.
- `lib/server/origin-check.ts`: on non-GET, assert `Content-Type: application/json` and `Origin`/`Referer` match
  `APP_ORIGIN`; else `FORBIDDEN`.

## Layer Ownership

| Responsibility | Owner |
|---|---|
| Rendering, skeletons, `formatCOP` display | UI (`app/**`, `components/**`) |
| Shape/type validation, reject unknown+sensitive fields | Validation (`lib/schemas`) |
| Session→businessId, ownership checks, compute lineTotal/subtotal/total/status, orchestration | Service (`lib/services`) |
| Persistence, atomic per-business numbering, locked balance check | Data-access (`lib/mock` via ports) |

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Payment route shape | `POST /api/invoices/[id]/payments` | top-level `/api/payments` POST | invoiceId in path enforces ownership+lock key; matches api-spec.md |
| Atomicity boundary | inside repo/mock under `withLock` (emulates future Postgres RPC/row lock) | lock in service | numbering + read-check-write are transaction concerns; keeps service pure & swap-safe |
| quantity precision | carry as integer milli-units in math, single rounding at lineTotal | float multiply | avoids FP drift while quantity stays fractional |
| Print isolation | dedicated `(print)` route group + layout | print CSS inside dashboard | clean print shell, still session-guarded |
| Negocio | read-only `settings/page.tsx`, no `/api/business` | build endpoint now | per proposal decision 1 (editing deferred) |
| Docs renderer | Scalar (`ssr:false`) | swagger-ui-react | React 19 peer conflict (proposal decision 2) |

## Atomicity Flag & Overpay Race Proof

**Flagged (config.yaml design rule):** invoice creation and payment registration are financial mutations requiring
atomicity. Both run inside `withLock`. **Overpay race** (`docs/testing-plan.md`: two concurrent payments exceeding
balance): both handlers call `createForInvoice`, which serializes on `withLock(invoiceId)`. Because
read-balance → check `amount>balance` → insert → recompute happens entirely inside one lock holder, the second
request cannot read a stale pre-insert balance. Example (balance 100; A=60, B=60): A acquires → reads 100 → 60≤100 →
inserts → balance 40 → releases; B acquires → reads 40 → 60>40 → rejected, invoice unchanged (no partial apply, per
proposal decision 3). The promise-chain mutex holds across `await`s, so no interleaving occurs on the single Node
event loop. **Limitation:** correctness is single-process only; real Supabase must use a DB transaction with
`SELECT ... FOR UPDATE`/RPC — documented as the swap-time requirement.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | money (`roundHalfUp`, `lineTotal`), `computeStatus`, overpay rejection, per-business numbering | Vitest against services/mock |
| Integration | route handlers: auth guard, strict schema rejection, ownership, no-store, pagination | Vitest + mock store reset per test |
| E2E | login → create customer → invoice → partial payment → balance/status → print receipt | Playwright |
| Concurrency | two parallel payments exceeding balance → one rejected | Promise.all against `createForInvoice` |

## Migration / Rollout

No data migration (repo is code-empty). Test runner (Vitest/Testing Library/Playwright) added by the preceding
change; re-run sdd-init so `strict_tdd:true`. Real Supabase later = replace `lib/mock/*` + `repositories.ts` only.

## Open Questions

- [ ] Confirm at apply that `@scalar/api-reference-react` renders under React 19 (keep `ssr:false` regardless).
- [ ] Confirm shadcn init uses Tailwind v4 (`@tailwindcss/postcss` + `@theme`), not v3 config.
