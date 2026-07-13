import { listAuditLog } from "@/lib/services/audit-log-service";
import type { Session } from "@/lib/services/ports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * "Movimientos" audit-history widget, per
 * `openspec/changes/audit-log/specs/audit-logging/spec.md`'s "MovementsPanel
 * Is a Widget-Level Gate, Not a Page-Level Gate" requirement and
 * `design.md`'s Panel gate decision. Mirrors
 * `components/domain/dashboard/recent-payments.tsx`'s Card+Table+empty-state
 * shape exactly (a simple read-only history list).
 *
 * Deliberately takes `session` as a prop rather than resolving it itself:
 * the gate (`can(session.role, "viewAuditLog")`) is evaluated by the CALLER
 * at the call site on the invoice detail page — this component is only ever
 * rendered when that check already passed, so it has no gating logic of its
 * own and simply reads via `listAuditLog(session, entityType, entityId)`
 * inline (no extra API route), which is itself business-scoped by
 * `session.businessId`.
 */
export type MovementsPanelProps = {
  session: Session;
  entityType: string;
  entityId: string;
};

export async function MovementsPanel({ session, entityType, entityId }: MovementsPanelProps) {
  const entries = await listAuditLog(session, entityType, entityId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Accion</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin movimientos registrados.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.actorUserId}</TableCell>
                  <TableCell>{entry.detail ?? "-"}</TableCell>
                  <TableCell>{entry.createdAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
