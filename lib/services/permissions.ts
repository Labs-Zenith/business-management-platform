import type { Role } from "./ports";

/**
 * Capability -> role mapping (proposal "Roles + Multi-Business Membership
 * Foundation"). No feature is gated by this yet — Nomina is the first real
 * consumer, in a later change. This module only needs to exist and be
 * correct/tested.
 */
export type Capability = "viewPayroll";

const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  viewPayroll: ["admin"],
};

/** Deny-by-default: any capability not present in `CAPABILITY_ROLES` returns `false`. */
export function can(role: Role, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability]?.includes(role) ?? false;
}

export function canViewPayroll(role: Role): boolean {
  return can(role, "viewPayroll");
}
