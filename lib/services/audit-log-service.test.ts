import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogCreate, AuditLogEntry, Session } from "@/lib/services/ports";

/**
 * SAFETY-CRITICAL: proves `recordAuditLog`'s swallow-and-log contract — this
 * is the single most important behavioral guarantee in this change (per
 * `openspec/changes/audit-log/design.md`'s "Audit insert transactionality"
 * decision). A rejecting `repositories.auditLog.create` must NEVER surface as
 * a thrown error from `recordAuditLog` itself.
 */

const mockAuditLogCreate = vi.fn<(businessId: string, data: AuditLogCreate) => Promise<AuditLogEntry>>();
const mockAuditLogList = vi.fn<(businessId: string, entityType: string, entityId: string) => Promise<AuditLogEntry[]>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    auditLog: {
      create: (businessId: string, data: AuditLogCreate) => mockAuditLogCreate(businessId, data),
      list: (businessId: string, entityType: string, entityId: string) => mockAuditLogList(businessId, entityType, entityId),
    },
  },
}));

import { AUDIT_LOG_TIMEOUT_MS, listAuditLog, recordAuditLog } from "./audit-log-service";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

describe("recordAuditLog", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockAuditLogCreate.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("calls repositories.auditLog.create with entityType/entityId/action/actorUserId/detail from the session", async () => {
    mockAuditLogCreate.mockResolvedValue({
      id: "b0000000-0000-4000-8000-000000000001",
      businessId: SESSION.businessId,
      entityType: "invoice",
      entityId: INVOICE_ID,
      action: "invoice_created",
      actorUserId: SESSION.userId,
      detail: "FAC-0001",
      createdAt: "2026-07-13T00:00:00.000Z",
    });

    await recordAuditLog(SESSION, "invoice", INVOICE_ID, "invoice_created", "FAC-0001");

    expect(mockAuditLogCreate).toHaveBeenCalledWith(SESSION.businessId, {
      entityType: "invoice",
      entityId: INVOICE_ID,
      action: "invoice_created",
      actorUserId: SESSION.userId,
      detail: "FAC-0001",
    });
  });

  it("defaults detail to null when omitted", async () => {
    mockAuditLogCreate.mockResolvedValue({} as AuditLogEntry);

    await recordAuditLog(SESSION, "invoice", INVOICE_ID, "payment_recorded");

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      SESSION.businessId,
      expect.objectContaining({ detail: null }),
    );
  });

  it("SWALLOWS a rejecting repositories.auditLog.create — never rethrows, only console.error-logs", async () => {
    mockAuditLogCreate.mockRejectedValue(new Error("transient DB failure"));

    await expect(
      recordAuditLog(SESSION, "invoice", INVOICE_ID, "invoice_created", "FAC-0001"),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("does not throw even when repositories.auditLog.create throws synchronously", async () => {
    mockAuditLogCreate.mockImplementation(() => {
      throw new Error("synchronous failure");
    });

    await expect(recordAuditLog(SESSION, "invoice", INVOICE_ID, "invoice_created")).resolves.toBeUndefined();
  });

  it("resolves within AUDIT_LOG_TIMEOUT_MS (swallowed as a timeout) even when repositories.auditLog.create hangs forever, never resolving", async () => {
    vi.useFakeTimers();
    mockAuditLogCreate.mockImplementation(() => new Promise<AuditLogEntry>(() => {})); // never settles

    let settled = false;
    const promise = recordAuditLog(SESSION, "invoice", INVOICE_ID, "invoice_created").then(() => {
      settled = true;
    });

    // Nothing should settle before the timeout budget elapses.
    await vi.advanceTimersByTimeAsync(AUDIT_LOG_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    // Crossing the timeout budget must force recordAuditLog to give up and
    // resolve (never rethrow) instead of hanging indefinitely.
    await vi.advanceTimersByTimeAsync(2);
    await promise;

    expect(settled).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("listAuditLog", () => {
  beforeEach(() => {
    mockAuditLogList.mockReset();
  });

  it("scopes the read to session.businessId, passing entityType/entityId through", async () => {
    mockAuditLogList.mockResolvedValue([]);

    await listAuditLog(SESSION, "invoice", INVOICE_ID);

    expect(mockAuditLogList).toHaveBeenCalledWith(SESSION.businessId, "invoice", INVOICE_ID);
  });
});
