# Business Profile Specification (Read-Only) — Delta

Delta against `openspec/specs/business-profile/spec.md` (baseline unchanged unless noted below).

## ADDED Requirements

### Requirement: Per-Business Feature Flags Column

The `businesses` table MUST have an `enabled_features` column (array of feature-key strings, default empty) that future changes (Nomina, Inventario, etc.) use to determine which optional capabilities are enabled for a given business, in addition to the user's role. This change only introduces the column — no feature currently reads it.

#### Scenario: Column exists but ungated

- GIVEN a business row
- WHEN inspected
- THEN it has an `enabled_features` array column, defaulting to empty, with no capability in this change yet consulting it

### Requirement: A Business May Now Have Multiple Members

The 1:1 assumption ("one business = one profile") no longer holds. A business's profile display MUST continue to resolve strictly from `session.businessId` (unchanged from baseline) regardless of how many members that business has — this requirement does not change, it is restated here because the underlying `profiles` table shape changed in this same release (see `role-permissions`/`mock-auth-session` deltas).

#### Scenario: Business profile display unaffected by membership count

- GIVEN a business with 2 members (admin + worker)
- WHEN either member views the "Negocio" screen
- THEN both see the identical business record, scoped by `session.businessId` exactly as before
