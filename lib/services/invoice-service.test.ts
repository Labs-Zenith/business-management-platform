import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { lineTotal } from "@/lib/money";
import type {
  Customer,
  CustomerDetail,
  Invoice,
  InvoiceDetail,
  InvoiceListQuery,
  InvoicePersist,
  InvoiceWithFinance,
  Paged,
  Session,
} from "@/lib/services/ports";

/**
 * SAFETY-CRITICAL: proves the invoice service NEVER trusts anything from the
 * client input except `session.businessId` and the validated item
 * `quantity`/`unitPrice` values — everything else (`number`, `status`,
 * `subtotal`, `total`, `business_id`, per-item `lineTotal`) is always
 * server-computed, even if forged directly onto the input object via a
 * force-cast (bypassing `lib/schemas/invoice.ts` entirely), matching the
 * technique already established in `customer-service.test.ts`'s "never
 * forwards a client business_id even if forged onto the input object".
 */

const mockCustomersGetById = vi.fn<(businessId: string, id: string) => Promise<CustomerDetail | null>>();
const mockInvoicesCreate = vi.fn<(businessId: string, data: InvoicePersist) => Promise<InvoiceDetail>>();
const mockInvoicesList = vi.fn<(businessId: string, query: InvoiceListQuery) => Promise<Paged<InvoiceWithFinance>>>();
const mockInvoicesGetById = vi.fn<(businessId: string, id: string) => Promise<InvoiceDetail | null>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    customers: {
      getById: (businessId: string, id: string) => mockCustomersGetById(businessId, id),
    },
    invoices: {
      create: (businessId: string, data: InvoicePersist) => mockInvoicesCreate(businessId, data),
      list: (businessId: string, query: InvoiceListQuery) => mockInvoicesList(businessId, query),
      getById: (businessId: string, id: string) => mockInvoicesGetById(businessId, id),
    },
  },
}));

import { createInvoice, getInvoice, listInvoices } from "./invoice-service";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";

const CUSTOMER: Customer = {
  id: CUSTOMER_ID,
  businessId: SESSION.businessId,
  name: "Ana Gomez",
  documentNumber: null,
  email: null,
  phone: null,
  address: null,
  notes: null,
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const CUSTOMER_DETAIL: CustomerDetail = {
  ...CUSTOMER,
  totalInvoiced: 0,
  totalPaid: 0,
  balance: 0,
  recentInvoices: [],
  recentPayments: [],
};

const VALID_INPUT = {
  customerId: CUSTOMER_ID,
  issueDate: "2026-07-06",
  dueDate: "2026-08-06",
  items: [{ description: "Servicio de estetica", quantity: 2, unitPrice: 500000 }],
  notes: null,
};

function buildInvoiceDetail(overrides: Partial<Invoice> = {}): InvoiceDetail {
  const invoice: Invoice = {
    id: "50000000-0000-4000-8000-000000000999",
    businessId: SESSION.businessId,
    customerId: CUSTOMER_ID,
    number: "FAC-0099",
    issueDate: VALID_INPUT.issueDate,
    dueDate: VALID_INPUT.dueDate,
    subtotal: 1000000,
    total: 1000000,
    status: "pending",
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
  return {
    ...invoice,
    paidAmount: 0,
    balance: invoice.total,
    customer: CUSTOMER,
    items: [],
    payments: [],
  };
}

describe("createInvoice", () => {
  beforeEach(() => {
    mockCustomersGetById.mockReset();
    mockInvoicesCreate.mockReset();
  });

  it("computes lineTotal/subtotal/total/status server-side and persists under session.businessId", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    mockInvoicesCreate.mockResolvedValue(buildInvoiceDetail());

    await createInvoice(SESSION, VALID_INPUT);

    expect(mockCustomersGetById).toHaveBeenCalledWith(SESSION.businessId, CUSTOMER_ID);
    expect(mockInvoicesCreate).toHaveBeenCalledWith(
      SESSION.businessId,
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        subtotal: lineTotal(2, 500000),
        total: lineTotal(2, 500000),
        status: "pending",
        items: [
          expect.objectContaining({
            description: "Servicio de estetica",
            quantity: 2,
            unitPrice: 500000,
            lineTotal: lineTotal(2, 500000),
          }),
        ],
      }),
    );
  });

  it("ignores/overwrites forged number/status/total/business_id even when force-cast directly onto the input object (bypassing the Zod schema entirely)", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    mockInvoicesCreate.mockResolvedValue(buildInvoiceDetail());

    const forged = {
      ...VALID_INPUT,
      number: "FAC-FORGED",
      status: "paid",
      subtotal: 1,
      total: 1,
      business_id: OTHER_BUSINESS_ID,
    } as unknown as typeof VALID_INPUT;

    await createInvoice(SESSION, forged);

    // The service is called with SESSION.businessId as the businessId
    // ARGUMENT — the forged `business_id` property on the input object is
    // never read anywhere in the implementation.
    expect(mockInvoicesCreate).toHaveBeenCalledWith(
      SESSION.businessId,
      expect.objectContaining({
        total: lineTotal(2, 500000),
        subtotal: lineTotal(2, 500000),
        status: "pending",
      }),
    );
    expect(mockInvoicesCreate).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, expect.anything());
    const persisted = mockInvoicesCreate.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(persisted.number).toBeUndefined();
    expect(persisted.business_id).toBeUndefined();
  });

  it("rejects a customerId belonging to a different business with NOT_FOUND, and never calls repositories.invoices.create (no partial invoice created)", async () => {
    // The repo call is always scoped by SESSION.businessId; a customer that
    // belongs to a DIFFERENT business resolves to null from that call.
    mockCustomersGetById.mockResolvedValue(null);

    await expect(createInvoice(SESSION, VALID_INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockInvoicesCreate).not.toHaveBeenCalled();
  });

  it("aborts the WHOLE creation with VALIDATION_ERROR when any item has quantity <= 0 — nothing partially persisted", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    const invalidInput = {
      ...VALID_INPUT,
      items: [
        { description: "Item valido", quantity: 1, unitPrice: 100000 },
        { description: "Item invalido", quantity: 0, unitPrice: 100000 },
      ],
    };

    await expect(createInvoice(SESSION, invalidInput)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockInvoicesCreate).not.toHaveBeenCalled();
  });

  it("aborts the WHOLE creation with VALIDATION_ERROR when any item has a negative unitPrice — nothing partially persisted", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    const invalidInput = {
      ...VALID_INPUT,
      items: [
        { description: "Item valido", quantity: 1, unitPrice: 100000 },
        { description: "Item invalido", quantity: 1, unitPrice: -1 },
      ],
    };

    await expect(createInvoice(SESSION, invalidInput)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockInvoicesCreate).not.toHaveBeenCalled();
  });

  it("propagates an ApiError instance (not a generic Error) on validation failure", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    const invalidInput = { ...VALID_INPUT, items: [{ description: "x", quantity: -5, unitPrice: 0 }] };

    await expect(createInvoice(SESSION, invalidInput)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listInvoices", () => {
  beforeEach(() => {
    mockInvoicesList.mockReset();
  });

  it("always scopes the list to session.businessId, never a client-supplied id", async () => {
    const query: InvoiceListQuery = { page: 1, pageSize: 20 };
    mockInvoicesList.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    await listInvoices(SESSION, query);

    expect(mockInvoicesList).toHaveBeenCalledWith(SESSION.businessId, query);
    expect(mockInvoicesList).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, query);
  });
});

describe("getInvoice", () => {
  beforeEach(() => {
    mockInvoicesGetById.mockReset();
  });

  it("returns the invoice detail (with the repo's recomputed status) scoped to the session's business", async () => {
    const detail = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue(detail);

    const result = await getInvoice(SESSION, detail.id);

    expect(mockInvoicesGetById).toHaveBeenCalledWith(SESSION.businessId, detail.id);
    expect(result.status).toBe(detail.status);
  });

  it("throws NOT_FOUND (not the other business's data) when the repo resolves null for a cross-business id", async () => {
    mockInvoicesGetById.mockResolvedValue(null);

    await expect(getInvoice(SESSION, "cross-business-invoice-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
