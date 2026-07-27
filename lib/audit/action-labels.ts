/**
 * Human-readable Spanish labels for audit-log `action` enums, shown in the
 * "Movimientos" panel (`components/domain/audit-log/movements-panel.tsx`).
 * Actions are free TEXT (extensible by design — see `AuditLogRepository`), so
 * an unknown/future action falls back to a prettified form (underscores →
 * spaces, first letter capitalized) rather than rendering a raw enum.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  invoice_created: "Factura creada",
  invoice_updated: "Factura actualizada",
  payment_recorded: "Pago registrado",
  quote_created: "Cotización creada",
  quote_updated: "Cotización actualizada",
  quote_status_updated: "Estado de cotización actualizado",
  quote_converted_to_invoice: "Cotización convertida a factura",
};

/** Maps an audit `action` to its Spanish label, prettifying unknown values. */
export function formatAuditAction(action: string): string {
  const known = AUDIT_ACTION_LABELS[action];
  if (known) return known;
  const pretty = action.replace(/_/g, " ").trim();
  return pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : action;
}
