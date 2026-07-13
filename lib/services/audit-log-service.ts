/**
 * Audit log service, per
 * `openspec/changes/audit-log/specs/audit-logging/spec.md` and
 * `openspec/changes/audit-log/design.md`'s "Audit insert transactionality"
 * decision.
 *
 * SAFETY-CRITICAL CONTRACT: callers always `await recordAuditLog(...)` —
 * this is the correct pattern, and it is required for ordering: audit rows
 * must land in the same order as the mutations that triggered them. What
 * callers get in exchange for awaiting is a strong guarantee that neither a
 * FAILURE (the insert rejects) nor EXCESSIVE LATENCY (the insert hangs — a
 * cold connection, lock contention, pool exhaustion, a network partition)
 * can ever affect their own already-committed result: `recordAuditLog` never
 * rethrows, and it is bounded by `AUDIT_LOG_TIMEOUT_MS` internally, so the
 * awaited call can never hold up the caller's response beyond that bound.
 * Callers don't need to check its return value or wrap it in their own
 * try/catch — just `await` it and keep going.
 */

import { repositories } from "@/lib/services/repositories";
import type { AuditLogEntry, Session } from "@/lib/services/ports";

/**
 * Upper bound on how long `recordAuditLog` may wait on the underlying
 * `repositories.auditLog.create` call before giving up and treating it like
 * a rejection (swallow + log). Without this, a hung insert (pool
 * exhaustion, lock contention, a cold Neon connection, a network partition)
 * would hold the caller's `await` open until the platform's own function
 * timeout fired — turning an already-successful mutation into an apparent
 * failure for the client. Picked as a few seconds: long enough for a normal
 * transient slowdown, short enough to never meaningfully delay a response.
 */
export const AUDIT_LOG_TIMEOUT_MS = 2500;

/**
 * Races `promise` against a timer of `ms` milliseconds. Resolves/rejects
 * with whichever settles first; on timeout, rejects with a dedicated error
 * so the caller can tell a timeout apart from a "real" rejection if it ever
 * needs to (today, `recordAuditLog` treats both identically).
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`recordAuditLog: audit insert did not settle within ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Records one audit row for `entityType`/`entityId`, attributing it to
 * `session.userId`. Swallows and logs any failure OR timeout — see this
 * file's SAFETY-CRITICAL doc comment above.
 */
export async function recordAuditLog(
  session: Session,
  entityType: string,
  entityId: string,
  action: string,
  detail?: string | null,
): Promise<void> {
  try {
    await withTimeout(
      repositories.auditLog.create(session.businessId, {
        entityType,
        entityId,
        action,
        actorUserId: session.userId,
        detail: detail ?? null,
      }),
      AUDIT_LOG_TIMEOUT_MS,
    );
  } catch (error) {
    // Never rethrow: the triggering mutation already succeeded and must not
    // be affected by an audit-insert failure or a hung audit insert.
    console.error("recordAuditLog failed (swallowed, mutation unaffected):", error);
  }
}

/**
 * Thin, business-scoped pass-through for the MovementsPanel (PR3) to read an
 * entity's audit history, ordered `createdAt` DESC (per
 * `AuditLogRepository.list`'s contract).
 */
export async function listAuditLog(session: Session, entityType: string, entityId: string): Promise<AuditLogEntry[]> {
  return repositories.auditLog.list(session.businessId, entityType, entityId);
}
