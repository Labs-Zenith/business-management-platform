import type { AuditLogCreate, AuditLogEntry, AuditLogRepository } from "@/lib/services/ports";
import { sql } from "./client";

type AuditLogRow = {
  id: string;
  business_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  detail: string | null;
  created_at: string;
};

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    businessId: row.business_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    detail: row.detail,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Mirrors `db/expense-repo.ts`'s shape — a single business-scoped fetch
 * filtered/sorted in JS (no speculative indexes beyond the migration's
 * `idx_audit_log_entity`), plus a plain `INSERT ... RETURNING *`. Append-only:
 * no update/delete method exists on `AuditLogRepository`.
 */
export const auditLogRepo: AuditLogRepository = {
  async list(businessId: string, entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    const rows = (await sql`
      SELECT * FROM audit_log
      WHERE business_id = ${businessId} AND entity_type = ${entityType} AND entity_id = ${entityId}
    `) as unknown as AuditLogRow[];
    const entries = rows.map(toAuditLogEntry);
    entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    return entries;
  },

  async create(businessId: string, data: AuditLogCreate): Promise<AuditLogEntry> {
    const rows = (await sql`
      INSERT INTO audit_log (id, business_id, entity_type, entity_id, action, actor_user_id, detail)
      VALUES (gen_random_uuid(), ${businessId}, ${data.entityType}, ${data.entityId}, ${data.action}, ${data.actorUserId}, ${data.detail ?? null})
      RETURNING *
    `) as unknown as AuditLogRow[];
    return toAuditLogEntry(rows[0]!);
  },
};
