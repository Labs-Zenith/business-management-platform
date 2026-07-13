import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { formatCOP, lineTotal } from "@/lib/money";
import type {
  AuditLogCreate,
  AuditLogEntry,
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
const mockInvoicesUpdate = vi.fn<(businessId: string, id: string, data: InvoicePersist) => Promise<InvoiceDetail | null>>();
const mockAuditLogCreate = vi.fn<(businessId: string, data: AuditLogCreate) => Promise<AuditLogEntry>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    customers: {
      getById: (businessId: string, id: string) => mockCustomersGetById(businessId, id),
    },
    invoices: {
      create: (businessId: string, data: InvoicePersist) => mockInvoicesCreate(businessId, data),
      list: (businessId: string, query: InvoiceListQuery) => mockInvoicesList(businessId, query),
      getById: (businessId: string, id: string) => mockInvoicesGetById(businessId, id),
      update: (businessId: string, id: string, data: InvoicePersist) => mockInvoicesUpdate(businessId, id, data),
    },
    auditLog: {
      create: (businessId: string, data: AuditLogCreate) => mockAuditLogCreate(businessId, data),
    },
  },
}));

import { createInvoice, getInvoice, listInvoices, updateInvoice } from "./invoice-service";

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
    mockAuditLogCreate.mockReset();
    mockAuditLogCreate.mockResolvedValue({} as AuditLogEntry);
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

  it("records an invoice_created audit row (entityType='invoice', entityId=the new invoice's id) after a successful create", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    const created = buildInvoiceDetail();
    mockInvoicesCreate.mockResolvedValue(created);

    await createInvoice(SESSION, VALID_INPUT);

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      SESSION.businessId,
      expect.objectContaining({
        entityType: "invoice",
        entityId: created.id,
        action: "invoice_created",
        actorUserId: SESSION.userId,
      }),
    );
  });

  it("still returns the created invoice successfully even when the audit-log insert rejects (best-effort, never affects the caller)", async () => {
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    const created = buildInvoiceDetail();
    mockInvoicesCreate.mockResolvedValue(created);
    mockAuditLogCreate.mockRejectedValue(new Error("transient audit failure"));

    const result = await createInvoice(SESSION, VALID_INPUT);

    expect(result).toEqual(created);
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

describe("updateInvoice", () => {
  const VALID_UPDATE = {
    customerId: CUSTOMER_ID,
    issueDate: "2026-07-09",
    dueDate: "2026-08-09",
    items: [{ description: "Servicio editado", quantity: 1, unitPrice: 300000 }],
    notes: null,
  };

  beforeEach(() => {
    mockInvoicesGetById.mockReset();
    mockCustomersGetById.mockReset();
    mockInvoicesUpdate.mockReset();
    mockAuditLogCreate.mockReset();
    mockAuditLogCreate.mockResolvedValue({} as AuditLogEntry);
  });

  it("proceeds to the repository when the invoice is PARTIALLY paid (balance > 0), computing status from the REAL paidAmount (not 0)", async () => {
    const partiallyPaid = buildInvoiceDetail({ status: "partially_paid" });
    const paidAmount = 50000;
    mockInvoicesGetById.mockResolvedValue({ ...partiallyPaid, paidAmount, balance: partiallyPaid.total - paidAmount });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    // VALID_UPDATE's single item (1 x 300000 = 300000) stays well above
    // paidAmount (50000), so the below-paid guard does not trigger here.
    mockInvoicesUpdate.mockResolvedValue(buildInvoiceDetail());

    await updateInvoice(SESSION, partiallyPaid.id, VALID_UPDATE);

    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      SESSION.businessId,
      partiallyPaid.id,
      expect.objectContaining({
        total: lineTotal(1, 300000),
        // status computed with the REAL paidAmount (50000), not 0 — a
        // balance > 0 invoice with paidAmount > 0 is "partially_paid".
        status: "partially_paid",
      }),
    );
  });

  it("rejects with VALIDATION_ERROR (not CONFLICT) when the submitted new total would drop BELOW the amount already paid, and never calls repositories.invoices.update", async () => {
    const partiallyPaid = buildInvoiceDetail({ status: "partially_paid" });
    const paidAmount = 500000; // above VALID_UPDATE's new total (300000)
    mockInvoicesGetById.mockResolvedValue({ ...partiallyPaid, paidAmount, balance: partiallyPaid.total - paidAmount });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    await expect(updateInvoice(SESSION, partiallyPaid.id, VALID_UPDATE)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockInvoicesUpdate).not.toHaveBeenCalled();
  });

  it("rejects with CONFLICT for a fully-paid invoice (paidAmount === total, balance === 0), same edit-lock rule as any paidAmount > 0", async () => {
    const fullyPaid = buildInvoiceDetail({ status: "paid" });
    mockInvoicesGetById.mockResolvedValue({ ...fullyPaid, paidAmount: fullyPaid.total, balance: 0 });

    await expect(updateInvoice(SESSION, fullyPaid.id, VALID_UPDATE)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockInvoicesUpdate).not.toHaveBeenCalled();
  });

  it("proceeds to the repository when the invoice has zero payments, computing subtotal/total/status server-side and never accepting number", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    mockInvoicesUpdate.mockResolvedValue(buildInvoiceDetail());

    await updateInvoice(SESSION, zeroPaymentInvoice.id, VALID_UPDATE);

    expect(mockCustomersGetById).toHaveBeenCalledWith(SESSION.businessId, CUSTOMER_ID);
    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      SESSION.businessId,
      zeroPaymentInvoice.id,
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        subtotal: lineTotal(1, 300000),
        total: lineTotal(1, 300000),
        status: "pending",
      }),
    );
    const persisted = mockInvoicesUpdate.mock.calls[0][2] as unknown as Record<string, unknown>;
    expect(persisted.number).toBeUndefined();
  });

  it("rejects an unknown/cross-business customerId with NOT_FOUND, never calling repositories.invoices.update", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(null);

    await expect(updateInvoice(SESSION, zeroPaymentInvoice.id, VALID_UPDATE)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockInvoicesUpdate).not.toHaveBeenCalled();
  });

  it("aborts with VALIDATION_ERROR before any repo call when an item has quantity <= 0", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    const invalidInput = { ...VALID_UPDATE, items: [{ description: "Invalido", quantity: 0, unitPrice: 100000 }] };

    await expect(updateInvoice(SESSION, zeroPaymentInvoice.id, invalidInput)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockInvoicesUpdate).not.toHaveBeenCalled();
  });

  it("rejects an edit down to ZERO items with VALIDATION_ERROR before any repo call (an edit must not be a backdoor to an empty invoice, matching createInvoice's schema-level .min(1))", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    const emptyItems = { ...VALID_UPDATE, items: [] as typeof VALID_UPDATE.items };

    await expect(updateInvoice(SESSION, zeroPaymentInvoice.id, emptyItems)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockInvoicesUpdate).not.toHaveBeenCalled();
  });

  it("ignores/overwrites forged number/status/total/subtotal/business_id even when force-cast directly onto the input object", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    mockInvoicesUpdate.mockResolvedValue(buildInvoiceDetail());

    const forged = {
      ...VALID_UPDATE,
      number: "FAC-FORGED",
      status: "paid",
      subtotal: 1,
      total: 1,
      business_id: OTHER_BUSINESS_ID,
    } as unknown as typeof VALID_UPDATE;

    await updateInvoice(SESSION, zeroPaymentInvoice.id, forged);

    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      SESSION.businessId,
      zeroPaymentInvoice.id,
      expect.objectContaining({
        total: lineTotal(1, 300000),
        subtotal: lineTotal(1, 300000),
        status: "pending",
      }),
    );
    expect(mockInvoicesUpdate).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, expect.anything(), expect.anything());
    const persisted = mockInvoicesUpdate.mock.calls[0][2] as unknown as Record<string, unknown>;
    expect(persisted.number).toBeUndefined();
    expect(persisted.business_id).toBeUndefined();
  });

  it("throws NOT_FOUND when the repository's update resolves null (e.g. deleted/cross-business between check and write)", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    mockInvoicesUpdate.mockResolvedValue(null);

    await expect(updateInvoice(SESSION, zeroPaymentInvoice.id, VALID_UPDATE)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("records an invoice_updated audit row (entityType='invoice', entityId=the REPO's returned id, not the caller-supplied id argument) after a successful update", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    // Deliberately a DIFFERENT id than zeroPaymentInvoice's — otherwise this
    // assertion can't discriminate "used the repo's returned updated.id"
    // (correct) from "used the caller-supplied id argument" (would also look
    // correct if the two ids happened to match by construction).
    const updated = buildInvoiceDetail({ id: "50000000-0000-4000-8000-000000000777" });
    mockInvoicesUpdate.mockResolvedValue(updated);

    await updateInvoice(SESSION, zeroPaymentInvoice.id, VALID_UPDATE);

    expect(updated.id).not.toBe(zeroPaymentInvoice.id);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      SESSION.businessId,
      expect.objectContaining({
        entityType: "invoice",
        entityId: updated.id,
        action: "invoice_updated",
        actorUserId: SESSION.userId,
      }),
    );
  });

  it("still returns the updated invoice successfully even when the audit-log insert rejects (best-effort, never affects the caller)", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending" });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    const updated = buildInvoiceDetail();
    mockInvoicesUpdate.mockResolvedValue(updated);
    mockAuditLogCreate.mockRejectedValue(new Error("transient audit failure"));

    const result = await updateInvoice(SESSION, zeroPaymentInvoice.id, VALID_UPDATE);

    expect(result).toEqual(updated);
  });

  it("does NOT record an audit row when the edit-lock rejects with CONFLICT (fully paid, no repo call was even attempted)", async () => {
    const fullyPaid = buildInvoiceDetail({ status: "paid" });
    mockInvoicesGetById.mockResolvedValue({ ...fullyPaid, paidAmount: fullyPaid.total, balance: 0 });

    await expect(updateInvoice(SESSION, fullyPaid.id, VALID_UPDATE)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("does NOT record an audit row when the below-paid-total VALIDATION_ERROR rejects (no repo call was even attempted)", async () => {
    const partiallyPaid = buildInvoiceDetail({ status: "partially_paid" });
    const paidAmount = 500000; // above VALID_UPDATE's new total (300000)
    mockInvoicesGetById.mockResolvedValue({ ...partiallyPaid, paidAmount, balance: partiallyPaid.total - paidAmount });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);

    await expect(updateInvoice(SESSION, partiallyPaid.id, VALID_UPDATE)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("records the invoice_updated audit detail as the EXACT composed string 'Total: <old COP> → <new COP>' (COP-formatted, not raw cents)", async () => {
    const zeroPaymentInvoice = buildInvoiceDetail({ status: "pending", total: 1000000 });
    mockInvoicesGetById.mockResolvedValue({ ...zeroPaymentInvoice, paidAmount: 0, balance: zeroPaymentInvoice.total });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    const updated = buildInvoiceDetail({ total: 300000 });
    mockInvoicesUpdate.mockResolvedValue(updated);

    await updateInvoice(SESSION, zeroPaymentInvoice.id, VALID_UPDATE);

    // Exact composed string, mirroring how payment-service.test.ts asserts
    // its exact `Monto:` string — not just a loose shape/regex match.
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      SESSION.businessId,
      expect.objectContaining({
        action: "invoice_updated",
        detail: `Total: ${formatCOP(zeroPaymentInvoice.total)} → ${formatCOP(updated.total)}`,
      }),
    );
  });

  it("proceeds to the repository when a partially-paid invoice's edit is a NO-OP total change (new total == current total), keeping status partially_paid", async () => {
    const partiallyPaid = buildInvoiceDetail({ status: "partially_paid", total: 300000 });
    const paidAmount = 100000;
    mockInvoicesGetById.mockResolvedValue({ ...partiallyPaid, paidAmount, balance: partiallyPaid.total - paidAmount });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    // VALID_UPDATE's single item (1 x 300000 = 300000) equals the invoice's
    // CURRENT total exactly — a no-op total change, still well above
    // paidAmount (100000), so the below-paid guard does not trigger.
    mockInvoicesUpdate.mockResolvedValue(buildInvoiceDetail({ status: "partially_paid", total: 300000 }));

    await updateInvoice(SESSION, partiallyPaid.id, VALID_UPDATE);

    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      SESSION.businessId,
      partiallyPaid.id,
      expect.objectContaining({
        total: lineTotal(1, 300000),
        status: "partially_paid",
      }),
    );
  });

  it("proceeds to the repository when a partially-paid invoice's edit INCREASES the total", async () => {
    const partiallyPaid = buildInvoiceDetail({ status: "partially_paid", total: 100000 });
    const paidAmount = 50000;
    mockInvoicesGetById.mockResolvedValue({ ...partiallyPaid, paidAmount, balance: partiallyPaid.total - paidAmount });
    mockCustomersGetById.mockResolvedValue(CUSTOMER_DETAIL);
    // VALID_UPDATE's single item (1 x 300000 = 300000) is an INCREASE over
    // the invoice's current total (100000), well above paidAmount (50000).
    mockInvoicesUpdate.mockResolvedValue(buildInvoiceDetail({ status: "partially_paid", total: 300000 }));

    await updateInvoice(SESSION, partiallyPaid.id, VALID_UPDATE);

    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      SESSION.businessId,
      partiallyPaid.id,
      expect.objectContaining({
        total: lineTotal(1, 300000),
        status: "partially_paid",
      }),
    );
  });
});
