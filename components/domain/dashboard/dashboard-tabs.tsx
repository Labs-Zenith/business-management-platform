"use client";
import { useRef } from "react";
import { Tabs } from "@/components/ui/tabs";

export type DashboardTabsProps = { defaultValue: string; formId: string; children: React.ReactNode };

/**
 * Wraps `Tabs` with a hidden `tab` input that mirrors the active tab into
 * `<form id={formId}>` (`page.tsx`'s empty filter form). Without this, picking
 * a period while sitting on the Egresos tab would snap the user back to
 * Ingresos: the period submit (`PeriodMenu`) is a full GET navigation to
 * `?period=...&tab=...`, and its `tab` value comes only from this hidden
 * input — a `defaultValue` fixed at whatever tab the server last rendered
 * would never reflect a client-side tab switch. `onValueChange` keeps the
 * input's live DOM value in sync on every switch, read at submit time by
 * `new FormData(form, submitter)`.
 */
export function DashboardTabs({ defaultValue, formId, children }: DashboardTabsProps) {
  const tabInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={tabInputRef} type="hidden" name="tab" form={formId} defaultValue={defaultValue} />
      <Tabs
        defaultValue={defaultValue}
        onValueChange={(value) => {
          if (tabInputRef.current) tabInputRef.current.value = String(value);
        }}
      >
        {children}
      </Tabs>
    </>
  );
}
