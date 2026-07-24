import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CustomerWithBalance, Paged, PipelineCard, Session } from "@/lib/services/ports";

/**
 * `app/(dashboard)/ventas/page.tsx` — the page-level gate is the REAL
 * authority for the sales-pipeline feature (per `nav-items.ts`'s
 * `navItemsFor` doc comment: hiding the nav link is UX only). Mirrors
 * `nomina/page.test.tsx`'s "gated page" test shape, but gating on
 * `isPipelineEnabled(session.businessId)` (a per-BUSINESS feature flag)
 * instead of a role `capability` — `notFound()` is called directly in the
 * page body rather than via a `requireCapabilityOrNotFound` helper.
 */

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockIsPipelineEnabled = vi.fn<(businessId: string) => boolean>();
const mockListPipelineCards = vi.fn<(session: Session) => Promise<PipelineCard[]>>();
const mockListCustomers = vi.fn<(session: Session, query: unknown) => Promise<Paged<CustomerWithBalance>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/features", () => ({
  isPipelineEnabled: (businessId: string) => mockIsPipelineEnabled(businessId),
}));

vi.mock("@/lib/services/pipeline-service", () => ({
  listPipelineCards: (session: Session) => mockListPipelineCards(session),
}));

vi.mock("@/lib/services/customer-service", () => ({
  listCustomers: (session: Session, query: unknown) => mockListCustomers(session, query),
}));

// Dialogs/board are lazy or heavy client pieces with their own dedicated
// test files — stubbed here to their triggers/props only, mirroring
// `nomina/page.test.tsx`'s convention.
vi.mock("@/components/domain/ventas/nueva-card-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
}));
vi.mock("@/components/domain/ventas/ventas-board", () => ({
  default: ({ initialCards, customers }: { initialCards: PipelineCard[]; customers: Array<{ id: string; name: string }> }) => (
    <div data-testid="ventas-board">
      <div data-testid="ventas-board-cards">{JSON.stringify(initialCards)}</div>
      <div data-testid="ventas-board-customers">{JSON.stringify(customers)}</div>
    </div>
  ),
}));

import VentasPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const CARD: PipelineCard = {
  id: "80000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  customerId: null,
  title: "Oportunidad Acme",
  stage: "nuevo",
  amount: 500_000_00,
  notes: null,
  position: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const CUSTOMER: CustomerWithBalance = {
  id: "40000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Ana Gomez",
  documentNumber: null,
  email: null,
  phone: null,
  address: null,
  notes: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  balance: 0,
};

describe("VentasPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockIsPipelineEnabled.mockReset();
    mockListPipelineCards.mockReset();
    mockListCustomers.mockReset();
  });

  it("renders the board with cards/customers when the pipeline feature is enabled for the session's business", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsPipelineEnabled.mockReturnValue(true);
    mockListPipelineCards.mockResolvedValue([CARD]);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 200, total: 1 });

    render(await VentasPage());

    expect(mockIsPipelineEnabled).toHaveBeenCalledWith(SESSION.businessId);
    expect(mockListPipelineCards).toHaveBeenCalledWith(SESSION);
    expect(mockListCustomers).toHaveBeenCalledWith(SESSION, { page: 1, pageSize: 200 });

    expect(screen.getByText("Ventas")).toBeInTheDocument();
    expect(screen.getByTestId("ventas-board-cards")).toHaveTextContent(CARD.id);
    expect(screen.getByTestId("ventas-board-customers").textContent).toBe(
      JSON.stringify([{ id: CUSTOMER.id, name: CUSTOMER.name }]),
    );
  });

  it("results in a 404 when the pipeline feature is disabled for the session's business, and never fetches cards/customers", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsPipelineEnabled.mockReturnValue(false);

    await expect(VentasPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    expect(mockListPipelineCards).not.toHaveBeenCalled();
    expect(mockListCustomers).not.toHaveBeenCalled();
  });

  it("offers the 'Nueva' quick action", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsPipelineEnabled.mockReturnValue(true);
    mockListPipelineCards.mockResolvedValue([]);
    mockListCustomers.mockResolvedValue({ data: [], page: 1, pageSize: 200, total: 0 });

    render(await VentasPage());

    expect(screen.getByRole("button", { name: /nueva/i })).toBeInTheDocument();
  });
});
