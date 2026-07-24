"use client";

/**
 * Actual "create pipeline card" form + dialog implementation, mirroring
 * `customer-form-dialog-content.tsx`'s established dialog pattern (own
 * `trigger` prop + own `open` `useState`, plain `useState` form values —
 * not `react-hook-form`, matching the simpler dialogs in this app). Always
 * imported indirectly through `./nueva-card-dialog.tsx`
 * (`dynamic(..., {ssr:false})`) — never import this file directly.
 *
 * New cards default to the first kanban column (`STAGE_ORDER[0]`, `"nuevo"`)
 * — a brand-new lead always starts at the top of the pipeline.
 *
 * See `card-detail-dialog-content.tsx`'s doc comment for the shared
 * `NO_CUSTOMER_VALUE` sentinel and money-input conventions; this create form
 * reuses the same conventions but (unlike the edit dialog) sends explicit
 * `null` for an unset optional field too — `POST` has no prior server state
 * to accidentally clobber, so there's no omit-vs-null distinction to make,
 * and `pipelineCardCreateSchema` accepts `null` for each of them either way.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";
import type { ZodType } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { pipelineCardCreateSchema } from "@/lib/schemas/pipeline";
import { pesosToCents } from "@/lib/money";
import { STAGE_CONFIG, STAGE_ORDER } from "./stage";
import type { PipelineStage } from "@/lib/services/ports";

const GENERIC_ERROR_MESSAGE = "No se pudo crear la card. Verifica los datos e intenta de nuevo.";

/** Sentinel `customerId` `<Select>` value meaning "no customer linked" — see `card-detail-dialog-content.tsx`'s doc comment. */
const NO_CUSTOMER_VALUE = "none";

const DEFAULT_STAGE: PipelineStage = STAGE_ORDER[0];

export type NuevaCardDialogCustomer = { id: string; name: string };

type NuevaCardFormValues = {
  title: string;
  stage: PipelineStage;
  customerId: string;
  /** RAW pesos string for `<MoneyInput>` ("" = no amount). */
  amount: string;
  notes: string;
};

function blankFormValues(): NuevaCardFormValues {
  return { title: "", stage: DEFAULT_STAGE, customerId: NO_CUSTOMER_VALUE, amount: "", notes: "" };
}

function toPayload(values: NuevaCardFormValues) {
  return {
    title: values.title.trim(),
    stage: values.stage,
    customerId: values.customerId === NO_CUSTOMER_VALUE ? null : values.customerId,
    amount: values.amount.trim() ? pesosToCents(Number(values.amount)) : null,
    notes: values.notes.trim() ? values.notes.trim() : null,
  };
}

export type NuevaCardDialogProps = {
  customers: NuevaCardDialogCustomer[];
  /** Rendered as the dialog's trigger (e.g. a "+ Nueva" button). */
  trigger: ReactElement;
};

export default function NuevaCardDialog({ customers, trigger }: NuevaCardDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<NuevaCardFormValues>(blankFormValues);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const payload = toPayload(values);
  const { errors, isValid } = useZodForm(pipelineCardCreateSchema as ZodType<unknown>, payload);

  function updateField<K extends keyof NuevaCardFormValues>(key: K, value: NuevaCardFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues(blankFormValues());
      setTouched(false);
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isValid) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ventas", {
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
          <DialogTitle>Nueva card</DialogTitle>
          <DialogDescription>Agrega una nueva oportunidad al pipeline de ventas.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-title">Título</Label>
            <Input
              id="new-card-title"
              name="title"
              required
              value={values.title}
              onChange={(event) => updateField("title", event.target.value)}
              aria-invalid={Boolean(touched && errors.title)}
            />
            {touched && errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-stage">Estado</Label>
            <Select
              items={STAGE_ORDER.map((stage) => ({ value: stage, label: STAGE_CONFIG[stage].label }))}
              value={values.stage}
              onValueChange={(value) => updateField("stage", (value as PipelineStage) ?? DEFAULT_STAGE)}
            >
              <SelectTrigger id="new-card-stage" className="h-9 w-full">
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_CONFIG[stage].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-customer">Cliente</Label>
            <Select
              items={[
                { value: NO_CUSTOMER_VALUE, label: "Sin cliente" },
                ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
              ]}
              value={values.customerId}
              onValueChange={(value) => updateField("customerId", value ?? NO_CUSTOMER_VALUE)}
            >
              <SelectTrigger id="new-card-customer" className="h-9 w-full">
                <SelectValue placeholder="Selecciona un cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER_VALUE}>Sin cliente</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-amount">Monto (COP)</Label>
            <MoneyInput
              id="new-card-amount"
              name="amount"
              value={values.amount}
              onChange={(value) => updateField("amount", value)}
              aria-invalid={Boolean(touched && errors.amount)}
            />
            {touched && errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-notes">Notas</Label>
            <Textarea
              id="new-card-notes"
              name="notes"
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
              {isSubmitting ? "Guardando..." : "Crear card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
