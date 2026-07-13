import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogCreate } from "@/lib/services/ports";
import { createAuditLogRepository } from "./audit-log-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/expense-repo.test.ts`'s scope (business_id scoping, no
 * lock/balance invariant, plain append-only insert) — adapted for
 * `AuditLogRepository`'s extra `entityType`/`entityId` filtering and
 * `createdAt` DESC ordering, per
 * `openspec/changes/audit-log/specs/audit-logging/spec.md`.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";
const OTHER_INVOICE_ID = "50000000-0000-4000-8000-000000000002";
const ACTOR_USER_ID = "20000000-0000-4000-8000-000000000001";

function buildInput(overrides: Partial<AuditLogCreate> = {}): AuditLogCreate {
  return {
    entityType: "invoice",
    entityId: INVOICE_ID,
    action: "invoice_created",
    actorUserId: ACTOR_USER_ID,
    detail: "FAC-0001",
    ...overrides,
  };
}

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createAuditLogRepository.create", () => {
  it("persists the entry with businessId from the arg, ignoring any businessId-shaped field on data", async () => {
    const repo = createAuditLogRepository(store);

    const entry = await repo.create(BUSINESS_ID, buildInput());

    expect(entry.businessId).toBe(BUSINESS_ID);
    expect(entry.entityType).toBe("invoice");
    expect(entry.entityId).toBe(INVOICE_ID);
    expect(entry.action).toBe("invoice_created");
    expect(entry.actorUserId).toBe(ACTOR_USER_ID);
    expect(entry.detail).toBe("FAC-0001");
    expect(store.auditLogs.get(entry.id)).toEqual(entry);
  });

  it("defaults detail to null when omitted", async () => {
    const repo = createAuditLogRepository(store);
    const input: AuditLogCreate = {
      entityType: "invoice",
      entityId: INVOICE_ID,
      action: "payment_recorded",
      actorUserId: ACTOR_USER_ID,
    };

    const entry = await repo.create(BUSINESS_ID, input);

    expect(entry.detail).toBeNull();
  });

  it("accepts an arbitrary action/entityType value — no CHECK-like restriction (extensible by design)", async () => {
    const repo = createAuditLogRepository(store);

    const entry = await repo.create(BUSINESS_ID, buildInput({ entityType: "future_entity", action: "future_action" }));

    expect(entry.entityType).toBe("future_entity");
    expect(entry.action).toBe("future_action");
  });
});

describe("createAuditLogRepository.list", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only entries scoped to businessId + entityType + entityId, newest first", async () => {
    // Control the clock explicitly instead of relying on a real-time sleep
    // between the two `create()` calls — a wall-clock `setTimeout` gap is not
    // deterministic under CI load/clock resolution, so advance fake time by a
    // full second between inserts to force an unambiguous `createdAt` order.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));

    const repo = createAuditLogRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ action: "invoice_created" }));
    vi.setSystemTime(new Date("2026-07-13T00:00:01.000Z"));
    await repo.create(BUSINESS_ID, buildInput({ action: "invoice_updated" }));
    await repo.create(BUSINESS_ID, buildInput({ entityId: OTHER_INVOICE_ID, action: "invoice_created" }));
    await repo.create(OTHER_BUSINESS_ID, buildInput({ action: "invoice_created" }));

    const result = await repo.list(BUSINESS_ID, "invoice", INVOICE_ID);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.action)).toEqual(["invoice_updated", "invoice_created"]);
    expect(result.every((e) => e.businessId === BUSINESS_ID && e.entityId === INVOICE_ID)).toBe(true);
  });

  it("filters out a different entityType even for the same entityId (defense against a future entity reusing the same UUID space)", async () => {
    const repo = createAuditLogRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ entityType: "invoice" }));
    await repo.create(BUSINESS_ID, buildInput({ entityType: "payment" }));

    const result = await repo.list(BUSINESS_ID, "invoice", INVOICE_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.entityType).toBe("invoice");
  });

  it("returns an empty array when no entries match", async () => {
    const repo = createAuditLogRepository(store);

    const result = await repo.list(BUSINESS_ID, "invoice", INVOICE_ID);

    expect(result).toEqual([]);
  });
});
