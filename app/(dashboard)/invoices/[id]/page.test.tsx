import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InvoiceDetail, Session } from "@/lib/services/ports";

/**
 * `app/(dashboard)/invoices/[id]/page.tsx`, per
 * `openspec/changes/audit-log/specs/audit-logging/spec.md`'s "MovementsPanel
 * Is a Widget-Level Gate, Not a Page-Level Gate" requirement. The
 * highest-value test here is the worker-sees-page-but-not-panel distinction
 * — TWO separate assertions (page renders fully; panel is absent), not one
 * conflated check, since this is the app's first widget-level (not
 * whole-page) role gate.
 */

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockGetInvoice = vi.fn<(session: Session, id: string) => Promise<InvoiceDetail>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/invoice-service", () => ({
  getInvoice: (session: Session, id: string) => mockGetInvoice(session, id),
}));

// PaymentFormDialog is lazy (`dynamic(..., {ssr:false})`) and has its own
// test file — stub to its trigger only, mirroring `nomina/page.test.tsx`'s
// convention.
vi.mock("@/components/domain/payments/payment-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
}));

// MovementsPanel has its own dedicated test file
// (`components/domain/audit-log/movements-panel.test.tsx`) — stub here to a
// marker exposing the props it received, so this file only needs to assert
// on WHETHER it's rendered (and with what entityId), not its internals.
vi.mock("@/components/domain/audit-log/movements-panel", () => ({
  MovementsPanel: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="movements-panel">{`${entityType}:${entityId}`}</div>
  ),
}));

import InvoiceDetailPage from "./page";

const ADMIN_SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const WORKER_SESSION: Session = {
  ...ADMIN_SESSION,
  userId: "20000000-0000-4000-8000-000000000002",
  role: "worker",
};

const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

function buildInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: INVOICE_ID,
    businessId: ADMIN_SESSION.businessId,
    customerId: "40000000-0000-4000-8000-000000000001",
    number: "FAC-0001",
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    subtotal: 100_000,
    total: 100_000,
    status: "pending",
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    paidAmount: 0,
    balance: 100_000,
    customer: {
      id: "40000000-0000-4000-8000-000000000001",
      businessId: ADMIN_SESSION.businessId,
      name: "Ana Gomez",
      documentNumber: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
      isActive: true,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    items: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        invoiceId: INVOICE_ID,
        description: "Consultoria",
        quantity: 1,
        unitPrice: 100_000,
        lineTotal: 100_000,
      },
    ],
    payments: [],
    ...overrides,
  };
}

describe("InvoiceDetailPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockGetInvoice.mockReset();
  });

  it("shows <MovementsPanel> to an admin session (can(role, 'viewAuditLog') is true)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(ADMIN_SESSION);
    mockGetInvoice.mockResolvedValue(buildInvoice());

    render(await InvoiceDetailPage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    const panel = screen.getByTestId("movements-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(`invoice:${INVOICE_ID}`);
  });

  it("does NOT show <MovementsPanel> to a worker session, while the rest of the invoice detail page still renders fully", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(WORKER_SESSION);
    mockGetInvoice.mockResolvedValue(buildInvoice());

    render(await InvoiceDetailPage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    // Assertion 1: the panel is genuinely absent, not just visually hidden.
    expect(screen.queryByTestId("movements-panel")).not.toBeInTheDocument();

    // Assertion 2: the rest of the page renders normally — full content,
    // no 404/redirect — these are two DISTINCT assertions, not conflated.
    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("Consultoria")).toBeInTheDocument();
  });

  it("shows the 'Editar factura' action when the invoice has zero payments (paidAmount === 0)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(ADMIN_SESSION);
    mockGetInvoice.mockResolvedValue(buildInvoice({ paidAmount: 0 }));

    render(await InvoiceDetailPage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    expect(screen.getByRole("button", { name: /editar factura/i })).toBeInTheDocument();
  });

  it("shows the 'Editar factura' action for a partially-paid invoice (paidAmount > 0 but balance > 0)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(ADMIN_SESSION);
    mockGetInvoice.mockResolvedValue(
      buildInvoice({
        paidAmount: 40_000,
        balance: 60_000,
        status: "partially_paid",
        payments: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            businessId: ADMIN_SESSION.businessId,
            invoiceId: INVOICE_ID,
            customerId: "40000000-0000-4000-8000-000000000001",
            paymentDate: "2026-07-05",
            amount: 40_000,
            method: null,
            notes: null,
            createdAt: "2026-07-05T00:00:00.000Z",
            updatedAt: "2026-07-05T00:00:00.000Z",
            customer: { id: "40000000-0000-4000-8000-000000000001", name: "Ana Gomez" },
            invoice: { id: INVOICE_ID, number: "FAC-0001" },
          },
        ],
      }),
    );

    render(await InvoiceDetailPage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    expect(screen.getByRole("button", { name: /editar factura/i })).toBeInTheDocument();
  });

  it("hides the 'Editar factura' action for a fully-paid invoice (paidAmount === total, balance === 0)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(ADMIN_SESSION);
    mockGetInvoice.mockResolvedValue(
      buildInvoice({ paidAmount: 100_000, balance: 0, status: "paid" }),
    );

    render(await InvoiceDetailPage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    expect(screen.queryByRole("button", { name: /editar factura/i })).not.toBeInTheDocument();
  });
});
