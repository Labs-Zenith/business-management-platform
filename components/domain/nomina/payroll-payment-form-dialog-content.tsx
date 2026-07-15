"use client";

/**
 * Actual "Registrar pago" dialog implementation, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Period Type Determines Computed Period Range" and "Atomic
 * Payment-to-Expense Linkage" requirements, and `design.md`'s Dialogs
 * section ("Payroll payment: RHF + `zodResolver` like
 * `expense-form-dialog-content.tsx`"). Payroll payments are append-only —
 * create only, no edit — so unlike the employee dialog there is no `mode`
 * prop. Always imported indirectly through `./payroll-payment-form-dialog.tsx`
 * (`dynamic(..., {ssr: false})`) — never import this file directly from a
 * page.
 *
 * `period_start`/`period_end` are ALWAYS server-derived
 * (`lib/services/payroll-service.ts`'s `createPayrollPayment`) — this
 * dialog's live preview below the reference-date field is a read-only UX
 * affordance computed with the SAME pure `computePeriod`/`periodDays`
 * functions the server uses (`lib/services/payroll-period.ts` has no
 * server-only imports — it only takes a type-only import from `./ports`,
 * which TypeScript elides entirely at compile time, so it is safe to import
 * directly into this Client Component). The preview is never sent to the
 * server; only `periodType`/`referenceDate` are submitted, and the server
 * recomputes the authoritative range itself.
 *
 * `amount` is entered as whole COP pesos, converted to integer cents
 * (`lib/money.ts`'s convention) only at submit time, matching
 * `expense-form-dialog-content.tsx`'s established money convention.
 *
 * POSTs directly to `/api/payroll-payments` (the dialog is the client-side
 * mutation boundary); on success, closes the dialog and calls
 * `router.refresh()` so the Nomina page's Pagos tab (and the dashboard's
 * Egresos tab, via the linked `category:'nomina'` expense) re-stream with
 * the new row.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayIsoDate } from "@/lib/dates";
import { pesosToCents } from "@/lib/money";
import { computePeriod, periodDays } from "@/lib/services/payroll-period";
import { payrollPaymentFormSchema, type PayrollPaymentFormValues } from "./payroll-payment-form-schema";

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el pago. Verifica los datos e intenta de nuevo.";

export type PayrollPaymentFormDialogEmployee = { id: string; name: string };

/** Minimal shape this dialog needs for the "Tipo de periodo" dropdown — a subset of `CatalogItem` (`lib/services/ports.ts`). */
export type PayrollPaymentFormDialogPeriodType = { id: string; code: string; label: string };

function defaultValues(employees: PayrollPaymentFormDialogEmployee[]): PayrollPaymentFormValues {
  return {
    employeeId: employees[0]?.id ?? "",
    amount: "",
    periodType: "quincenal",
    referenceDate: todayIsoDate(),
    paymentDate: todayIsoDate(),
    notes: "",
  };
}

export type PayrollPaymentFormDialogProps = {
  /** Active employees only — populates the employee select. */
  employees: PayrollPaymentFormDialogEmployee[];
  /** Sources the "Tipo de periodo" dropdown — passed from the Server Component page via `catalog-service#listPayrollPeriodTypes`. */
  periodTypes: PayrollPaymentFormDialogPeriodType[];
  /** Rendered as the dialog's trigger (e.g. a "Registrar pago" button). */
  trigger: ReactElement;
};

export default function PayrollPaymentFormDialog({ employees, periodTypes, trigger }: PayrollPaymentFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayrollPaymentFormValues>({
    resolver: zodResolver(payrollPaymentFormSchema),
    defaultValues: defaultValues(employees),
  });

  // `useWatch` (not `useForm()`'s returned `watch()`) — the dedicated hook is
  // safely memoizable and avoids the React Compiler "incompatible library"
  // bail-out that `watch()` triggers, matching `invoice-form-content.tsx`'s
  // established convention.
  const periodType = useWatch({ control, name: "periodType" });
  const referenceDate = useWatch({ control, name: "referenceDate" });

  const preview =
    referenceDate && !Number.isNaN(Date.parse(referenceDate))
      ? (() => {
          const { periodStart, periodEnd } = computePeriod(periodType, referenceDate);
          return { periodStart, periodEnd, days: periodDays(periodStart, periodEnd) };
        })()
      : null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(employees));
      setSubmitError(null);
    }
  }

  async function onSubmit(values: PayrollPaymentFormValues) {
    setSubmitError(null);
    try {
      const periodTypeId = periodTypes.find((type) => type.code === values.periodType)?.id;
      const payload = {
        employeeId: values.employeeId,
        amount: pesosToCents(Number(values.amount) || 0),
        periodType: values.periodType,
        ...(periodTypeId ? { periodTypeId } : {}),
        referenceDate: values.referenceDate,
        paymentDate: values.paymentDate,
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
      };

      const response = await fetch("/api/payroll-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setSubmitError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setSubmitError(GENERIC_ERROR_MESSAGE);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Registra un nuevo pago de nomina para un empleado.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payroll-employee">Empleado</Label>
            <Controller
              control={control}
              name="employeeId"
              render={({ field }) => (
                <Select
                  items={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="payroll-employee" className="h-9 w-full">
                    <SelectValue placeholder="Selecciona un empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.length === 0 ? (
                      <SelectItem value="" disabled>
                        Sin empleados activos
                      </SelectItem>
                    ) : null}
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.employeeId ? <p className="text-xs text-destructive">{errors.employeeId.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payroll-amount">Monto</Label>
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  id="payroll-amount"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.amount}
                />
              )}
            />
            {errors.amount ? <p className="text-xs text-destructive">{errors.amount.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payroll-period-type">Tipo de periodo</Label>
            <Controller
              control={control}
              name="periodType"
              render={({ field }) => (
                <Select
                  items={periodTypes.map((type) => ({ value: type.code, label: type.label }))}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="payroll-period-type" className="h-9 w-full">
                    <SelectValue placeholder="Selecciona un tipo de periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    {periodTypes.map((type) => (
                      <SelectItem key={type.id} value={type.code}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payroll-reference-date">Fecha de referencia</Label>
            {/*
              `referenceDate` is required (`payrollPaymentFormSchema`'s
              `z.string().trim().min(1, ...)`, no clearable/optional
              behavior like invoice's `dueDate`) and, unlike every other
              migrated field so far, ALSO drives the live period-preview
              above via `useWatch({ control, name: "referenceDate" })`
              (defined earlier in this component). `Controller`'s
              `field.onChange` writes to the exact same RHF field state
              `register()` did, so that `useWatch` subscriber keeps firing
              and `preview` keeps recomputing on every pick — the
              `computePeriod`/`periodDays`/`useWatch` logic itself is
              untouched, only this input mechanism changed. See
              `payroll-payment-form-dialog-content.test.tsx`'s "live period
              preview" tests for the empirical proof this survives.
            */}
            <Controller
              control={control}
              name="referenceDate"
              render={({ field }) => (
                <DatePicker id="payroll-reference-date" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.referenceDate ? (
              <p className="text-xs text-destructive">{errors.referenceDate.message}</p>
            ) : null}
          </div>
          {preview ? (
            <p data-testid="payroll-period-preview" className="text-sm text-muted-foreground">
              Periodo: {preview.periodStart} a {preview.periodEnd} ({preview.days} dias)
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payroll-payment-date">Fecha de pago</Label>
            <Controller
              control={control}
              name="paymentDate"
              render={({ field }) => (
                <DatePicker id="payroll-payment-date" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.paymentDate ? <p className="text-xs text-destructive">{errors.paymentDate.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payroll-notes">Nota</Label>
            <Textarea id="payroll-notes" {...register("notes")} />
          </div>
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
