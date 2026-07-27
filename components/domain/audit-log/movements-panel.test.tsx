import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuditLogListEntry, Session } from "@/lib/services/ports";

const mockListAuditLog = vi.fn<(session: Session, entityType: string, entityId: string) => Promise<AuditLogListEntry[]>>();

vi.mock("@/lib/services/audit-log-service", () => ({
  listAuditLog: (session: Session, entityType: string, entityId: string) =>
    mockListAuditLog(session, entityType, entityId),
}));

import { MovementsPanel } from "./movements-panel";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

function buildEntry(overrides: Partial<AuditLogListEntry> = {}): AuditLogListEntry {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    businessId: SESSION.businessId,
    entityType: "invoice",
    entityId: INVOICE_ID,
    action: "invoice_created",
    actorUserId: SESSION.userId,
    actorFullName: "Ana Demo",
    actorEmail: "ana@zenith.app",
    detail: "FAC-0001",
    createdAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("MovementsPanel", () => {
  beforeEach(() => {
    mockListAuditLog.mockReset();
  });

  it("calls listAuditLog scoped by session/entityType/entityId and renders rows in the order returned (createdAt DESC per the repository contract)", async () => {
    const newest = buildEntry({
      id: "70000000-0000-4000-8000-000000000002",
      action: "invoice_updated",
      createdAt: "2026-07-03T09:00:00.000Z",
    });
    const oldest = buildEntry({
      id: "70000000-0000-4000-8000-000000000001",
      action: "invoice_created",
      createdAt: "2026-07-01T12:00:00.000Z",
    });
    mockListAuditLog.mockResolvedValue([newest, oldest]);

    render(await MovementsPanel({ session: SESSION, entityType: "invoice", entityId: INVOICE_ID }));

    expect(mockListAuditLog).toHaveBeenCalledWith(SESSION, "invoice", INVOICE_ID);

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveTextContent("Factura actualizada");
    expect(rows[1]).toHaveTextContent("Factura creada");
  });

  it('renders the empty state ("Sin movimientos registrados.") when there is no history yet', async () => {
    mockListAuditLog.mockResolvedValue([]);

    render(await MovementsPanel({ session: SESSION, entityType: "invoice", entityId: INVOICE_ID }));

    expect(screen.getByText("Sin movimientos registrados.")).toBeInTheDocument();
  });

  it("renders the Spanish action label, the actor name, the detail, and a formatted date (not the raw enum/UUID/ISO)", async () => {
    mockListAuditLog.mockResolvedValue([buildEntry({ detail: "FAC-0007" })]);

    render(await MovementsPanel({ session: SESSION, entityType: "invoice", entityId: INVOICE_ID }));

    expect(screen.getByText("Factura creada")).toBeInTheDocument();
    expect(screen.getByText("Ana Demo")).toBeInTheDocument();
    expect(screen.getByText("FAC-0007")).toBeInTheDocument();
    // Date is localized, not the raw ISO.
    expect(screen.queryByText("2026-07-01T12:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    // Raw enum / UUID must not leak through.
    expect(screen.queryByText("invoice_created")).not.toBeInTheDocument();
    expect(screen.queryByText(SESSION.userId)).not.toBeInTheDocument();
  });

  it("falls back to the short username when the actor has no full name", async () => {
    mockListAuditLog.mockResolvedValue([
      buildEntry({ actorFullName: null, actorEmail: "printingcompany@zenith.app" }),
    ]);

    render(await MovementsPanel({ session: SESSION, entityType: "invoice", entityId: INVOICE_ID }));

    expect(screen.getByText("printingcompany")).toBeInTheDocument();
  });

  it("falls back to the raw actor id when neither name nor email is known", async () => {
    mockListAuditLog.mockResolvedValue([buildEntry({ actorFullName: null, actorEmail: null })]);

    render(await MovementsPanel({ session: SESSION, entityType: "invoice", entityId: INVOICE_ID }));

    expect(screen.getByText(SESSION.userId)).toBeInTheDocument();
  });

  it("renders a dash when detail is null", async () => {
    mockListAuditLog.mockResolvedValue([buildEntry({ detail: null })]);

    render(await MovementsPanel({ session: SESSION, entityType: "invoice", entityId: INVOICE_ID }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("-");
  });
});
