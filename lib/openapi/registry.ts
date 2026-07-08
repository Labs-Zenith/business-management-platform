/**
 * OpenAPI registry — single wiring point for the generated OpenAPI 3
 * document, per `openspec/changes/mocked-mvp-scaffold/design.md`'s "API /
 * OpenAPI Layer" section: "every schema in `lib/schemas/*` is registered
 * with `.openapi()` metadata ... Zod is the single source of truth -> spec
 * cannot drift from validation".
 *
 * This file NEVER redefines or duplicates a request-validation schema — it
 * imports and registers the REAL Zod schemas already used at runtime by the
 * route handlers (`app/api/customers/route.ts` etc.). Only shapes that have
 * NO existing exported Zod schema anywhere in the codebase (response
 * bodies, and the `/api/auth/login` request body, which is declared inline
 * and not exported by `app/api/auth/login/route.ts`) are defined here,
 * purely for documentation — they are never used for runtime validation.
 *
 * IMPORTANT — why `.meta({ id })` instead of `extendZodWithOpenApi()` /
 * `registry.register()`: that helper monkey-patches an `.openapi()` method
 * onto the shared `zod` module's `ZodType.prototype`, but zod v4's actual
 * schema instances do not resolve methods through that shared prototype —
 * each concrete schema "bakes in" its own method set at construction time.
 * A schema instance created BEFORE `extendZodWithOpenApi()` runs anywhere
 * in the module graph would silently lack `.openapi()` and throw
 * `"zodSchema.openapi is not a function"` the moment it's registered.
 * Because `lib/schemas/*` is imported by many route handlers in
 * unpredictable order, that load-order dependency is not safe. zod v4 ships
 * a native, always-available `.meta({ id, ...})` method instead (no
 * prototype patching required), which `zod-to-openapi`'s generator reads
 * natively — confirmed working against the installed
 * `@asteasolutions/zod-to-openapi@8.5.0` + `zod@4.4.3`. `.meta()` returns a
 * named clone that keeps the EXACT same validation rules as the original
 * (proven in `registry.test.ts`), never a hand-written duplicate.
 */

import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { customerCreateSchema, customerUpdateSchema } from "@/lib/schemas/customer";
import { invoiceCreateSchema } from "@/lib/schemas/invoice";
import { paymentCreateSchema } from "@/lib/schemas/payment";

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "SessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "session",
  description:
    "httpOnly session cookie set by POST /api/auth/login (see lib/mock/auth-adapter.ts). " +
    "Every private endpoint resolves business_id from this session server-side " +
    "(lib/session.ts#requireSession) — the client never sends business_id.",
});

/** Applied to every private path's `registerPath({ security })`. */
export const sessionSecurity = [{ SessionCookie: [] }];

const apiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

/** Mirrors `lib/server/api-error.ts`'s `{error:{code,message,details}}` shape. */
export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: apiErrorCodeSchema,
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: "ApiError" });

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ApiErrorSchema } },
  };
}

/** Common error responses, keyed by status code, per `docs/api-spec.md`'s error format. */
export const commonErrorResponses = {
  400: errorResponse("Validation error — invalid payload or query parameters."),
  401: errorResponse("Authentication required — no valid session."),
  403: errorResponse("Forbidden."),
  404: errorResponse("Resource not found (or belongs to a different business)."),
  409: errorResponse("Conflict."),
  500: errorResponse("Unexpected server error (details are never leaked)."),
} as const;

// ---- Request schemas — the REAL schemas from lib/schemas/*, named via .meta() ----

const CustomerCreate = customerCreateSchema.meta({ id: "CustomerCreate" });
const CustomerUpdate = customerUpdateSchema.meta({ id: "CustomerUpdate" });
const InvoiceCreate = invoiceCreateSchema.meta({ id: "InvoiceCreate" });
const PaymentCreate = paymentCreateSchema.meta({ id: "PaymentCreate" });

/**
 * `/api/auth/login`'s request body has no exported Zod schema (it is
 * declared inline, un-exported, in `app/api/auth/login/route.ts`) — this is
 * a doc-only mirror of that shape, never used for runtime validation.
 */
const LoginRequest = z
  .object({ email: z.string().email(), password: z.string().min(1) })
  .strict()
  .meta({ id: "LoginRequest" });

export const schemas = {
  CustomerCreate,
  CustomerUpdate,
  InvoiceCreate,
  PaymentCreate,
  LoginRequest,
};

// ---- Response schemas — doc-only shapes; no existing exported Zod schema exists for them ----

const CustomerSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    documentNumber: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    isActive: z.boolean(),
    balance: z.number(),
  })
  .meta({ id: "CustomerSummary" });

const CustomerList = z.object({ data: z.array(CustomerSummary) }).meta({ id: "CustomerList" });

const CustomerDetail = z
  .object({
    data: z.object({
      id: z.string(),
      name: z.string(),
      totalInvoiced: z.number(),
      totalPaid: z.number(),
      pendingBalance: z.number(),
      recentInvoices: z.array(z.unknown()),
      recentPayments: z.array(z.unknown()),
    }),
  })
  .meta({ id: "CustomerDetail" });

const invoiceStatusSchema = z.enum(["pending", "partially_paid", "paid", "overdue"]);

const InvoiceSummary = z
  .object({
    id: z.string(),
    number: z.string(),
    customerId: z.string(),
    total: z.number(),
    totalPaid: z.number(),
    balance: z.number(),
    status: invoiceStatusSchema,
  })
  .meta({ id: "InvoiceSummary" });

const InvoiceList = z.object({ data: z.array(InvoiceSummary) }).meta({ id: "InvoiceList" });

const InvoiceDetail = z
  .object({
    data: z.object({
      id: z.string(),
      number: z.string(),
      customerId: z.string(),
      items: z.array(z.unknown()),
      payments: z.array(z.unknown()),
      subtotal: z.number(),
      total: z.number(),
      paidAmount: z.number(),
      balance: z.number(),
      status: invoiceStatusSchema,
    }),
  })
  .meta({ id: "InvoiceDetail" });

const PaymentSummary = z
  .object({
    id: z.string(),
    customerId: z.string(),
    invoiceId: z.string(),
    amount: z.number(),
    method: z.string().nullable().optional(),
    paymentDate: z.string(),
  })
  .meta({ id: "PaymentSummary" });

const PaymentList = z.object({ data: z.array(PaymentSummary) }).meta({ id: "PaymentList" });

const DashboardSummary = z
  .object({
    data: z.object({
      pendingBalance: z.number(),
      paidThisMonth: z.number(),
      overdueInvoices: z.number(),
      overdueInvoiceList: z.array(z.unknown()),
      recentPayments: z.array(z.unknown()),
      topDebtors: z.array(z.unknown()),
    }),
  })
  .meta({ id: "DashboardSummary" });

const SessionResponse = z
  .object({
    data: z.object({
      session: z.object({ userId: z.string(), businessId: z.string(), email: z.string() }),
    }),
  })
  .meta({ id: "SessionResponse" });

const LogoutResponse = z
  .object({ data: z.object({ success: z.boolean() }) })
  .meta({ id: "LogoutResponse" });

// ---- Paths — one per documented endpoint, per docs/api-spec.md ----
// (excludes /api/business, descoped per design.md's "Negocio" decision)

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Sign in and start an httpOnly session.",
  request: { body: { content: { "application/json": { schema: LoginRequest } } } },
  responses: {
    200: { description: "Signed in.", content: { "application/json": { schema: SessionResponse } } },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Auth"],
  summary: "Sign out and clear the session.",
  security: sessionSecurity,
  responses: {
    200: { description: "Signed out.", content: { "application/json": { schema: LogoutResponse } } },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/customers",
  tags: ["Customers"],
  summary: "List customers for the authenticated business.",
  security: sessionSecurity,
  request: {
    query: z.object({
      q: z.string().optional(),
      status: z.enum(["active", "inactive"]).optional(),
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Customer list.", content: { "application/json": { schema: CustomerList } } },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/customers",
  tags: ["Customers"],
  summary: "Create a customer.",
  security: sessionSecurity,
  request: { body: { content: { "application/json": { schema: CustomerCreate } } } },
  responses: {
    201: { description: "Customer created.", content: { "application/json": { schema: CustomerSummary } } },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/customers/{id}",
  tags: ["Customers"],
  summary: "Get a customer's detail with financial summary.",
  security: sessionSecurity,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Customer detail.", content: { "application/json": { schema: CustomerDetail } } },
    401: commonErrorResponses[401],
    404: commonErrorResponses[404],
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/customers/{id}",
  tags: ["Customers"],
  summary: "Update editable customer fields.",
  security: sessionSecurity,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: CustomerUpdate } } },
  },
  responses: {
    200: { description: "Customer updated.", content: { "application/json": { schema: CustomerSummary } } },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    404: commonErrorResponses[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/invoices",
  tags: ["Invoices"],
  summary: "List invoices for the authenticated business.",
  security: sessionSecurity,
  request: {
    query: z.object({
      customerId: z.string().optional(),
      status: invoiceStatusSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Invoice list.", content: { "application/json": { schema: InvoiceList } } },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/invoices",
  tags: ["Invoices"],
  summary: "Create an invoice (atomic per-business numbering).",
  security: sessionSecurity,
  request: { body: { content: { "application/json": { schema: InvoiceCreate } } } },
  responses: {
    201: { description: "Invoice created.", content: { "application/json": { schema: InvoiceDetail } } },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    404: commonErrorResponses[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/invoices/{id}",
  tags: ["Invoices"],
  summary: "Get an invoice's detail (items, payments, computed status).",
  security: sessionSecurity,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Invoice detail.", content: { "application/json": { schema: InvoiceDetail } } },
    401: commonErrorResponses[401],
    404: commonErrorResponses[404],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/invoices/{id}/payments",
  tags: ["Payments"],
  summary: "Register a payment against an invoice (locked, overpay-rejecting).",
  security: sessionSecurity,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: PaymentCreate } } },
  },
  responses: {
    201: {
      description: "Payment registered; invoice balance/status recomputed.",
      content: { "application/json": { schema: InvoiceDetail } },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    404: commonErrorResponses[404],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/payments",
  tags: ["Payments"],
  summary: "List payments for the authenticated business.",
  security: sessionSecurity,
  request: {
    query: z.object({
      customerId: z.string().optional(),
      invoiceId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Payment list.", content: { "application/json": { schema: PaymentList } } },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: "get",
  path: "/api/dashboard/summary",
  tags: ["Dashboard"],
  summary: "Get the authenticated business's dashboard KPIs.",
  security: sessionSecurity,
  responses: {
    200: { description: "Dashboard summary.", content: { "application/json": { schema: DashboardSummary } } },
    401: commonErrorResponses[401],
  },
});
