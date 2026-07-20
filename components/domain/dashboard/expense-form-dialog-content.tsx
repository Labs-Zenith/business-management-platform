"use client";

/**
 * Actual "Crear gasto" dialog implementation, per
 * `openspec/changes/expenses-dashboard-split/specs/expense-tracking/spec.md`'s
 * "Crear Gasto Manual Entry Form" requirement and
 * `openspec/changes/expenses-dashboard-split/design.md` section 7. Always
 * imported indirectly through `./expense-form-dialog.tsx`
 * (`dynamic(..., {ssr: false})`) — never import this file directly from a
 * page, per the user's explicit lazy-loading requirement for form dialogs.
 *
 * Plain `useState` + native form, mirroring `customer-form-dialog-content.tsx`'s
 * /`payment-form-dialog-content.tsx`'s established pattern — no
 * `react-hook-form`/bespoke client schema. LIVE (as-you-type) validation is
 * layered on top via the shared `useZodForm` hook (`lib/hooks/use-zod-form.ts`),
 * fed the SAME shape the submit payload already builds — `lib/schemas/expense.ts`
 * (`expenseCreateSchema`) is the single source of truth for both the inline
 * client errors and the server's own `safeParse`. Each field only shows its
 * error once `touched` (via `onBlur`/interaction, or "touch all" on a submit
 * attempt), so a pristine dialog never opens already showing errors. The
 * submit button stays disabled while `!isValid`, in addition to the existing
 * `isSubmitting` guard.
 *
 * Money convention: `amount` is entered as whole COP pesos (natural UX —
 * typing raw integer cents would be unusable), converted to integer cents
 * (`lib/money.ts`'s convention) both for the live-validation payload and at
 * submit time.
 *
 * POSTs directly to `/api/expenses` (the dialog is the client-side mutation
 * boundary, matching `customer-form-dialog-content.tsx`'s established
 * pattern); on success, closes the dialog and calls `router.refresh()` so
 * the Egresos Server Components (`ExpenseKpiCards`/`ExpenseCharts`/
 * `RecentExpenses`) re-stream with the new row.
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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { todayIsoDate } from "@/lib/dates";
import { pesosToCents } from "@/lib/money";
import { expenseCreateSchema } from "@/lib/schemas/expense";

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el egreso. Verifica los datos e intenta de nuevo.";

/** Minimal shape this dialog needs for the "Categoria" dropdown — a subset of `CatalogItem` (`lib/services/ports.ts`). */
export type ExpenseFormDialogCategory = { id: string; code: string; label: string };

type ExpenseCategory = "nomina" | "otro";

type ExpenseFormValues = {
  category: ExpenseCategory;
  description: string;
  /** Whole-COP-peso RAW string from `MoneyInput` ("" when empty). */
  amount: string;
  expenseDate: string;
  notes: string;
};

type ExpenseFormTouchedField = "category" | "description" | "amount" | "expenseDate";
type ExpenseFormTouched = Partial<Record<ExpenseFormTouchedField, boolean>>;

const ALL_EXPENSE_FIELDS_TOUCHED: ExpenseFormTouched = {
  category: true,
  description: true,
  amount: true,
  expenseDate: true,
};

function defaultValues(): ExpenseFormValues {
  return { category: "otro", description: "", amount: "", expenseDate: todayIsoDate(), notes: "" };
}

export type ExpenseFormDialogProps = {
  /** Sources the "Categoria" dropdown — passed from the Server Component page via `catalog-service#listExpenseCategories`. */
  categories: ExpenseFormDialogCategory[];
  /** Rendered as the dialog's trigger (e.g. a "Crear gasto" button). */
  trigger: ReactElement;
};

export default function ExpenseFormDialog({ categories, trigger }: ExpenseFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ExpenseFormValues>(defaultValues);
  const [touched, setTouched] = useState<ExpenseFormTouched>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { errors, isValid } = useZodForm(expenseCreateSchema, {
    category: values.category,
    expenseDate: values.expenseDate,
    description: values.description,
    amount: pesosToCents(Number(values.amount) || 0),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
  });

  function updateField<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function markTouched(field: ExpenseFormTouchedField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(defaultValues());
      setTouched({});
      setError(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(ALL_EXPENSE_FIELDS_TOUCHED);
    if (!isValid) {
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const categoryId = categories.find((category) => category.code === values.category)?.id;
      const payload = {
        category: values.category,
        description: values.description,
        amount: pesosToCents(Number(values.amount) || 0),
        expenseDate: values.expenseDate,
        ...(categoryId ? { categoryId } : {}),
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      };

      const response = await fetch("/api/expenses", {
        method: "POST",
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
          <DialogTitle>Registrar egreso</DialogTitle>
          <DialogDescription>Registra un nuevo egreso para tu negocio.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-category">Categoría</Label>
            <Select
              items={categories.map((category) => ({ value: category.code, label: category.label }))}
              value={values.category}
              onValueChange={(value) => updateField("category", (value ?? "otro") as ExpenseCategory)}
              onOpenChange={(nextOpenSelect) => {
                if (!nextOpenSelect) markTouched("category");
              }}
            >
              <SelectTrigger id="expense-category" className="h-9 w-full">
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.code}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched.category && errors.category ? (
              <p className="text-xs text-destructive">{errors.category}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-description">Descripción</Label>
            <Input
              id="expense-description"
              value={values.description}
              onChange={(event) => updateField("description", event.target.value)}
              onBlur={() => markTouched("description")}
              aria-invalid={Boolean(touched.description && errors.description)}
            />
            {touched.description && errors.description ? (
              <p className="text-xs text-destructive">{errors.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">Monto</Label>
            <MoneyInput
              id="expense-amount"
              value={values.amount}
              onChange={(value) => updateField("amount", value)}
              onBlur={() => markTouched("amount")}
              aria-invalid={Boolean(touched.amount && errors.amount)}
            />
            {touched.amount && errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-date">Fecha</Label>
            <DatePicker
              id="expense-date"
              value={values.expenseDate}
              onChange={(value) => {
                updateField("expenseDate", value);
                markTouched("expenseDate");
              }}
            />
            {touched.expenseDate && errors.expenseDate ? (
              <p className="text-xs text-destructive">{errors.expenseDate}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-notes">Nota</Label>
            <Textarea
              id="expense-notes"
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>
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
