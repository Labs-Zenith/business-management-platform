import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import type {
  Customer,
  CustomerDetail,
  CustomerListQuery,
  CustomerUpdate,
  CustomerWithBalance,
  Paged,
  Session,
} from "@/lib/services/ports";

const mockList = vi.fn<(businessId: string, query: CustomerListQuery) => Promise<Paged<CustomerWithBalance>>>();
const mockGetById = vi.fn<(businessId: string, id: string) => Promise<CustomerDetail | null>>();
const mockCreate = vi.fn<(businessId: string, data: unknown) => Promise<Customer>>();
const mockUpdate = vi.fn<(businessId: string, id: string, data: CustomerUpdate) => Promise<Customer | null>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    customers: {
      list: (businessId: string, query: CustomerListQuery) => mockList(businessId, query),
      getById: (businessId: string, id: string) => mockGetById(businessId, id),
      create: (businessId: string, data: unknown) => mockCreate(businessId, data),
      update: (businessId: string, id: string, data: CustomerUpdate) => mockUpdate(businessId, id, data),
    },
  },
}));

import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customer-service";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
};

const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const CUSTOMER: Customer = {
  id: "40000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Ana Gomez",
  documentNumber: "1000000001",
  email: "ana.gomez@example.com",
  phone: "3001111111",
  address: null,
  notes: null,
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const CUSTOMER_DETAIL: CustomerDetail = {
  ...CUSTOMER,
  totalInvoiced: 500000,
  totalPaid: 200000,
  balance: 300000,
  recentInvoices: [],
  recentPayments: [],
};

describe("listCustomers", () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it("always scopes the list to session.businessId, never a client-supplied id", async () => {
    const query: CustomerListQuery = { page: 1, pageSize: 20 };
    mockList.mockResolvedValue({ data: [{ ...CUSTOMER, balance: 300000 }], page: 1, pageSize: 20, total: 1 });

    const result = await listCustomers(SESSION, query);

    expect(mockList).toHaveBeenCalledWith(SESSION.businessId, query);
    expect(mockList).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, query);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("getCustomer", () => {
  beforeEach(() => {
    mockGetById.mockReset();
  });

  it("returns the customer detail scoped to the session's business", async () => {
    mockGetById.mockResolvedValue(CUSTOMER_DETAIL);

    const result = await getCustomer(SESSION, CUSTOMER.id);

    expect(mockGetById).toHaveBeenCalledWith(SESSION.businessId, CUSTOMER.id);
    expect(result).toEqual(CUSTOMER_DETAIL);
  });

  it("throws NOT_FOUND (not the other business's data) when the repo resolves null for a cross-business id", async () => {
    // The repo call is always scoped by SESSION.businessId; a customer that
    // belongs to a DIFFERENT business resolves to null from that call, and
    // the service must surface NOT_FOUND rather than any data.
    mockGetById.mockResolvedValue(null);

    await expect(getCustomer(SESSION, "some-other-business-customer-id")).rejects.toBeInstanceOf(ApiError);
    await expect(getCustomer(SESSION, "some-other-business-customer-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("createCustomer", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("creates the customer under session.businessId", async () => {
    mockCreate.mockResolvedValue(CUSTOMER);

    const result = await createCustomer(SESSION, { name: "Ana Gomez" });

    expect(mockCreate).toHaveBeenCalledWith(SESSION.businessId, { name: "Ana Gomez" });
    expect(result).toEqual(CUSTOMER);
  });

  it("never forwards a client business_id even if forged onto the input object", async () => {
    mockCreate.mockResolvedValue(CUSTOMER);
    const forged = { name: "Ana Gomez", business_id: OTHER_BUSINESS_ID } as unknown as { name: string };

    await createCustomer(SESSION, forged);

    // The businessId param passed to the repo is always session.businessId —
    // the repo itself only persists the businessId ARGUMENT, never a
    // property read off `data`.
    expect(mockCreate).toHaveBeenCalledWith(SESSION.businessId, forged);
    expect(mockCreate).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, expect.anything());
  });
});

describe("updateCustomer", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it("applies a valid descriptive update scoped to session.businessId", async () => {
    mockUpdate.mockResolvedValue({ ...CUSTOMER, phone: "3009999999" });

    const result = await updateCustomer(SESSION, CUSTOMER.id, { phone: "3009999999" });

    expect(mockUpdate).toHaveBeenCalledWith(SESSION.businessId, CUSTOMER.id, { phone: "3009999999" });
    expect(result.phone).toBe("3009999999");
  });

  it("strips any forged business_id/balance field before calling the repository (defense in depth beyond the Zod schema)", async () => {
    mockUpdate.mockResolvedValue(CUSTOMER);
    const forged = {
      phone: "3009999999",
      business_id: OTHER_BUSINESS_ID,
      balance: 999999,
    } as unknown as { phone: string };

    await updateCustomer(SESSION, CUSTOMER.id, forged);

    expect(mockUpdate).toHaveBeenCalledWith(SESSION.businessId, CUSTOMER.id, { phone: "3009999999" });
  });

  it("throws NOT_FOUND (not FORBIDDEN, not leaking existence) when the repo resolves null for a cross-business id", async () => {
    mockUpdate.mockResolvedValue(null);

    await expect(updateCustomer(SESSION, "cross-business-id", { phone: "3009999999" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
