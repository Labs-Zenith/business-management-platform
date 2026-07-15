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
 * Uses `react-hook-form` + `zodResolver` (matching
 * `invoice-form-content.tsx`'s stack), since `category` is a fixed-value
 * select alongside three other fields — closer in shape to the invoice form
 * than to the plain-`useState` customer/payment dialogs.
 *
 * Money convention: `amount` is entered as whole COP pesos (natural UX —
 * typing raw integer cents would be unusable), converted to integer cents
 * (`lib/money.ts`'s convention) only at submit time, exactly like
 * `invoice-form-content.tsx`'s `unitPrice` convention.
 *
 * POSTs directly to `/api/expenses` (the dialog is the client-side mutation
 * boundary, matching `customer-form-dialog-content.tsx`'s established
 * pattern); on success, closes the dialog and calls `router.refresh()` so
 * the Egresos Server Components (`ExpenseKpiCards`/`ExpenseCharts`/
 * `RecentExpenses`) re-stream with the new row.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { todayIsoDate } from "@/lib/dates";
import { pesosToCents } from "@/lib/money";
import { expenseFormSchema, type ExpenseFormValues } from "./expense-form-schema";

const GENERIC_ERROR_MESSAGE = "No se pudo registrar el egreso. Verifica los datos e intenta de nuevo.";

/** Minimal shape this dialog needs for the "Categoria" dropdown — a subset of `CatalogItem` (`lib/services/ports.ts`). */
export type ExpenseFormDialogCategory = { id: string; code: string; label: string };

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
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: defaultValues(),
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues());
      setSubmitError(null);
    }
  }

  async function onSubmit(values: ExpenseFormValues) {
    setSubmitError(null);
    try {
      const categoryId = categories.find((category) => category.code === values.category)?.id;
      const payload = {
        category: values.category,
        description: values.description,
        amount: pesosToCents(Number(values.amount) || 0),
        expenseDate: values.expenseDate,
        ...(categoryId ? { categoryId } : {}),
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
      };

      const response = await fetch("/api/expenses", {
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
          <DialogTitle>Registrar egreso</DialogTitle>
          <DialogDescription>Registra un nuevo egreso para tu negocio.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-category">Categoria</Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select
                  items={categories.map((category) => ({ value: category.code, label: category.label }))}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="expense-category" className="h-9 w-full">
                    <SelectValue placeholder="Selecciona una categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.code}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category ? <p className="text-xs text-destructive">{errors.category.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-description">Descripcion</Label>
            <Input id="expense-description" {...register("description")} />
            {errors.description ? <p className="text-xs text-destructive">{errors.description.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">Monto</Label>
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  id="expense-amount"
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
            <Label htmlFor="expense-date">Fecha</Label>
            <Controller
              control={control}
              name="expenseDate"
              render={({ field }) => <DatePicker id="expense-date" value={field.value} onChange={field.onChange} />}
            />
            {errors.expenseDate ? <p className="text-xs text-destructive">{errors.expenseDate.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-notes">Nota</Label>
            <Textarea id="expense-notes" {...register("notes")} />
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
