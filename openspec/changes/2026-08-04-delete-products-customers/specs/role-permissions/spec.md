# Role Permissions Delta

## ADDED Requirements

### Requirement: deleteRecords Capability

The system MUST expose a `deleteRecords` capability granted to `admin` only, gating `DELETE /api/products/{id}` and `DELETE /api/customers/{id}`. It MUST NOT restrict creating or editing those records. Hiding the delete button in the UI is a UX affordance, never the control.

#### Scenario: Admin holds the capability

- GIVEN a session whose role is `admin`
- WHEN `deleteRecords` is checked
- THEN it resolves to true

#### Scenario: Worker is denied

- GIVEN a session whose role is `worker`
- WHEN `deleteRecords` is checked
- THEN it resolves to false
- AND both delete routes respond `403 FORBIDDEN`

#### Scenario: Worker retains create and edit

- GIVEN a session whose role is `worker`
- WHEN that session creates or updates a product or a customer
- THEN the request succeeds
- BECAUSE only deletion is gated
