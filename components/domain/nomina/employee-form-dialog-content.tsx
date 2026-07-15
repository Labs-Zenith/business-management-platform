"use client";

/**
 * Actual create/edit employee form + dialog implementation, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Employees Are Business-Scoped and Editable" requirement and
 * `design.md`'s Dialogs section ("Employee (`employee-form-dialog-content.tsx`):
 * plain `useState` like `customer-form-dialog-content.tsx`").
 *
 * Line-for-line analog of `customer-form-dialog-content.tsx`: employees are
 * editable (unlike expenses/payments), so this dialog supports both `create`
 * and `edit` modes and the `active` toggle mirrors `isActive`'s edit-only
 * visibility. Always imported indirectly through `./employee-form-dialog.tsx`
 * (`dynamic(..., {ssr: false})`) — never import this file directly from a
 * page.
 *
 * Mutations POST/PATCH `/api/employees` directly (the dialog is the
 * client-side mutation boundary); `router.refresh()` re-runs the Nomina
 * page's Server Component fetch afterwards so the Empleados tab reflects the
 * change.
 *
 * `baseSalary` is entered as whole COP pesos (natural UX) and converted to
 * integer cents only at submit time via `lib/money.ts`'s `pesosToCents`,
 * matching `expense-form-dialog-content.tsx`'s money convention.
 *
 * Live (as-you-type) validation via the shared `useZodForm` hook
 * (`lib/hooks/use-zod-form.ts`) against the SAME domain schema the server
 * enforces (`lib/schemas/employee.ts`'s `employeeCreateSchema`/
 * `employeeUpdateSchema`) — the create/update variant is picked per `mode`,
 * matching `buildPayload`'s existing create/edit payload-shape split.
 * Messages come straight from the schema (no custom Spanish overrides), so
 * inline errors may read as zod's default English messages — this is a
 * deliberate "single source of truth" tradeoff, not an oversight. Each
 * field only renders its error once `touched` (blurred at least once), and
 * the submit button stays disabled while `!isValid`.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { pesosToCents } from "@/lib/money";
import { employeeCreateSchema, employeeUpdateSchema } from "@/lib/schemas/employee";

const GENERIC_ERROR_MESSAGE = "No se pudo guardar el empleado. Verifica los datos e intenta de nuevo.";

export type EmployeeFormDialogEmployee = {
  id: string;
  name: string;
  /** Integer minor units (COP cents), per `lib/money.ts`'s convention. */
  baseSalary: number;
  active: boolean;
};

type EmployeeFormValues = {
  name: string;
  /** Whole COP pesos, as entered by the user (raw string) — converted at submit time. */
  baseSalary: string;
  active: boolean;
};

function toFormValues(employee?: EmployeeFormDialogEmployee): EmployeeFormValues {
  return {
    name: employee?.name ?? "",
    baseSalary: employee ? String(employee.baseSalary / 100) : "",
    active: employee?.active ?? true,
  };
}

/**
 * Maps the form's raw string `values` to the exact payload shape/types the
 * domain schema (and the server) expect — reused both to feed `useZodForm`
 * (live validation) and as the actual `fetch` request body, so the two never
 * drift apart.
 */
function buildPayload(mode: "create" | "edit", values: EmployeeFormValues) {
  const baseSalary = pesosToCents(Number(values.baseSalary) || 0);
  return mode === "create"
    ? { name: values.name.trim(), baseSalary }
    : { name: values.name.trim(), baseSalary, active: values.active };
}

type EmployeeFormTouched = { name?: boolean; baseSalary?: boolean };

export type EmployeeFormDialogProps = {
  mode: "create" | "edit";
  /** Required when `mode === "edit"`. */
  employee?: EmployeeFormDialogEmployee;
  /** Rendered as the dialog's trigger (e.g. a "Nuevo empleado" or "Editar" button). */
  trigger: ReactElement;
};

export default function EmployeeFormDialog({ mode, employee, trigger }: EmployeeFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EmployeeFormValues>(() => toFormValues(employee));
  const [touched, setTouched] = useState<EmployeeFormTouched>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const schema = mode === "create" ? employeeCreateSchema : employeeUpdateSchema;
  // Explicit `<unknown>` type argument: TS can't unify the create/update
  // schemas' differing (required vs. optional) output types into a single
  // `T` for `ZodType<T>` inference, and the hook's `errors`/`isValid`
  // return shape doesn't depend on `T` anyway (`values` is already
  // `unknown`), so this sidesteps the inference failure with no runtime
  // behavior change.
  const { errors, isValid } = useZodForm<unknown>(schema, buildPayload(mode, values));

  function updateField<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function markTouched(field: keyof EmployeeFormTouched) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(toFormValues(employee));
      setTouched({});
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isValid) {
      setTouched({ name: true, baseSalary: true });
      return;
    }

    setIsSubmitting(true);

    try {
      const isCreate = mode === "create";
      const url = isCreate ? "/api/employees" : `/api/employees/${employee!.id}`;
      const payload = buildPayload(mode, values);

      const response = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nuevo empleado" : "Editar empleado"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Registra un nuevo empleado para tu negocio."
              : "Actualiza los datos del empleado."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employee-name">Nombre</Label>
            <Input
              id="employee-name"
              name="name"
              required
              value={values.name}
              onChange={(event) => updateField("name", event.target.value)}
              onBlur={() => markTouched("name")}
              aria-invalid={touched.name && !!errors.name}
            />
            {touched.name && errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employee-base-salary">Salario base</Label>
            <MoneyInput
              id="employee-base-salary"
              name="baseSalary"
              required
              value={values.baseSalary}
              onChange={(value) => updateField("baseSalary", value)}
              onBlur={() => markTouched("baseSalary")}
              aria-invalid={touched.baseSalary && !!errors.baseSalary}
            />
            {touched.baseSalary && errors.baseSalary ? (
              <p className="text-xs text-destructive">{errors.baseSalary}</p>
            ) : null}
          </div>
          {mode === "edit" ? (
            <div className="flex items-center gap-2.5">
              <Switch
                id="employee-active"
                checked={values.active}
                onCheckedChange={(checked) => updateField("active", checked)}
              />
              <Label htmlFor="employee-active">Empleado activo</Label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !isValid} className="w-full sm:w-auto">
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
