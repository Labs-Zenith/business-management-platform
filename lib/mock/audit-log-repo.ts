import type { AuditLogCreate, AuditLogEntry, AuditLogRepository } from "@/lib/services/ports";
import { generateId, store as defaultStore, type MockStore } from "./store";

/**
 * Mirrors `expense-repo.ts`'s structure — append-only (no `withLock`, no
 * balance invariant), a single synchronous insert with no read-check-write
 * race to guard against. See
 * `openspec/changes/audit-log/design.md`'s "Audit insert transactionality"
 * decision: `create` is called best-effort, AFTER the triggering mutation
 * already committed, by `lib/services/audit-log-service.ts#recordAuditLog` —
 * this repository itself has no knowledge of that contract, it is a plain
 * append-only store.
 */
export function createAuditLogRepository(store: MockStore): AuditLogRepository {
  return {
    async list(businessId: string, entityType: string, entityId: string): Promise<AuditLogEntry[]> {
      const entries = [...store.auditLogs.values()].filter(
        (entry) => entry.businessId === businessId && entry.entityType === entityType && entry.entityId === entityId,
      );
      entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
      return entries;
    },

    async create(businessId: string, data: AuditLogCreate): Promise<AuditLogEntry> {
      const entry: AuditLogEntry = {
        id: generateId(),
        businessId, // ALWAYS from arg, never from data
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        actorUserId: data.actorUserId,
        detail: data.detail ?? null,
        createdAt: new Date().toISOString(),
      };
      store.auditLogs.set(entry.id, entry);
      return entry;
    },
  };
}

export const auditLogRepo: AuditLogRepository = createAuditLogRepository(defaultStore);
