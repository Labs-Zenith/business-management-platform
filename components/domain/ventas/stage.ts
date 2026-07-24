import { PIPELINE_STAGES, type PipelineStage } from "@/lib/services/ports";

/**
 * UI mapping for the sales-pipeline stages (kanban columns): label + Badge
 * variant. Per DESIGN.md, statuses use the SEMANTIC badge variants (never the
 * `--chart-*` data-series colors), and green (`success`) is reserved — only
 * the won stage is green. `nuevo` is neutral (`outline`), not colored, since
 * a fresh lead isn't an "attention" state.
 */
type StageBadgeVariant = "outline" | "info" | "warning" | "success" | "destructive";

export const STAGE_CONFIG: Record<PipelineStage, { label: string; variant: StageBadgeVariant }> = {
  nuevo: { label: "Nuevo", variant: "outline" },
  interesado: { label: "Interesado", variant: "info" },
  negociacion: { label: "Negociación", variant: "warning" },
  ganado: { label: "Cerrado ganado", variant: "success" },
  perdido: { label: "Cerrado perdido", variant: "destructive" },
};

/** Left-to-right kanban column order. */
export const STAGE_ORDER: readonly PipelineStage[] = PIPELINE_STAGES;
