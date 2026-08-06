# Role Permissions Delta

## ADDED Requirements

### Requirement: voidInvoice Capability

The system MUST expose a `voidInvoice` capability granted to `admin` only, gating `POST /api/invoices/{id}/void`. It MUST be its own capability rather than a reuse of `deleteRecords`, which is documented as covering products and customers, and which deletes rows — voiding never does.

#### Scenario: Admin holds it, worker does not

- GIVEN a session whose role is `admin`, then one whose role is `worker`
- THEN `voidInvoice` resolves true for the admin and false for the worker
- AND the worker's void request is refused with `403 FORBIDDEN` before any repository call
- AND the "Anular factura" action is not rendered for the worker
