/**
 * Mandatory legal notice for every printable comprobante (invoice or payment
 * receipt), per `docs/security-plan.md`'s "Aviso legal de documentos" and
 * `openspec/changes/mocked-mvp-scaffold/specs/receipts/spec.md`'s "Mandatory
 * Legal Notice" requirement: the text below MUST be rendered verbatim on
 * every printable view and MUST NOT be omitted or made optional/conditional
 * — this component takes no props and cannot be configured to hide the
 * notice.
 */
export function DianNotice() {
  return (
    <p className="mt-6 border-t pt-4 text-center text-xs font-medium text-muted-foreground">
      Documento interno, no valido como factura electronica DIAN.
    </p>
  );
}
