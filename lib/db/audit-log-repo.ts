import type { AuditLogCreate, AuditLogEntry, AuditLogListEntry, AuditLogRepository } from "@/lib/services/ports";
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

/** `list`'s row shape: an audit row LEFT JOINed to the actor's `profiles` row. */
type AuditLogListRow = AuditLogRow & {
  actor_full_name: string | null;
  actor_email: string | null;
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

function toAuditLogListEntry(row: AuditLogListRow): AuditLogListEntry {
  return {
    ...toAuditLogEntry(row),
    actorFullName: row.actor_full_name,
    actorEmail: row.actor_email,
  };
}

/**
 * Mirrors `db/expense-repo.ts`'s shape — a single business-scoped fetch
 * filtered/sorted in JS (no speculative indexes beyond the migration's
 * `idx_audit_log_entity`), plus a plain `INSERT ... RETURNING *`. Append-only:
 * no update/delete method exists on `AuditLogRepository`.
 *
 * `list` LEFT JOINs `profiles` (on `user_id` + `business_id`) to resolve the
 * actor's `full_name`/`email` for display — LEFT so an entry whose actor has
 * no profile row for this business still returns (with null actor identity).
 */
export const auditLogRepo: AuditLogRepository = {
  async list(businessId: string, entityType: string, entityId: string): Promise<AuditLogListEntry[]> {
    const rows = (await sql`
      SELECT a.*, p.full_name AS actor_full_name, p.email AS actor_email
      FROM audit_log a
      LEFT JOIN profiles p ON p.user_id = a.actor_user_id AND p.business_id = a.business_id
      WHERE a.business_id = ${businessId} AND a.entity_type = ${entityType} AND a.entity_id = ${entityId}
    `) as unknown as AuditLogListRow[];
    const entries = rows.map(toAuditLogListEntry);
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
