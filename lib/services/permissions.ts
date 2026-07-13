import type { Role } from "./ports";

/**
 * Capability -> role mapping (proposal "Roles + Multi-Business Membership
 * Foundation"). Nomina (`viewPayroll`) was the first real consumer;
 * `viewAuditLog` (`openspec/changes/audit-log/specs/role-permissions/spec.md`)
 * is the second, gating the admin-only `<MovementsPanel>` widget — NOTE this
 * is a WIDGET-level gate at the call site (plain `can()`), NOT a page-level
 * `requireCapabilityOrNotFound` guard like `viewPayroll`'s Nomina page: the
 * invoice detail page itself must stay reachable for workers.
 */
export type Capability = "viewPayroll" | "viewAuditLog";

const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  viewPayroll: ["admin"],
  viewAuditLog: ["admin"],
};

/** Deny-by-default: any capability not present in `CAPABILITY_ROLES` returns `false`. */
export function can(role: Role, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability]?.includes(role) ?? false;
}

export function canViewPayroll(role: Role): boolean {
  return can(role, "viewPayroll");
}

export function canViewAuditLog(role: Role): boolean {
  return can(role, "viewAuditLog");
}
