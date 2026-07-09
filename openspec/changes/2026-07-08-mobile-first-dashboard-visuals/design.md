# Design: Mobile-First Dashboard Visuals

## Technical Approach

Keep the existing layered architecture. UI components render charts and responsive layouts; `lib/services/dashboard-service.ts` derives chart-ready data from the existing business-scoped repositories; data-access remains unchanged. Charts are client components because `recharts` renders in the browser, while their data is assembled by server components.

## Dashboard Charts

- Add small service helpers for chart data:
  - receivables by invoice status, with counts and balances.
  - top debtor balances, reusing customer balances.
  - recent monthly payment totals from payments.
- Render charts in compact cards below KPI cards:
  - status distribution bar/donut.
  - top debtor horizontal bars.
  - payment activity bar chart.
- Use `--chart-*` theme tokens exposed through Tailwind/shadcn, not hard-coded brand colors.

## Responsive UI

Use Tailwind mobile-first defaults:

- Page wrappers keep `p-4`, with optional larger breakpoint spacing only when useful.
- Header action groups stack on mobile and align inline from `sm`.
- Filters are `grid grid-cols-1` by default, then expand with `sm`/`lg`.
- Inputs/selects use `w-full` by default and fixed/min widths only at wider breakpoints.
- Dialogs get viewport-safe max height and overflow scrolling.
- Tables keep the existing `Table` component's local `overflow-x-auto`; add minimum table widths where content needs stable columns.

## Theme

Run the requested getdesign Vercel theme command and keep generated changes limited to theme/component styling. If generated output conflicts with the current Tailwind v4 shadcn setup, preserve the working Tailwind v4 imports and merge only compatible variables/classes.

## Layer Ownership

| Responsibility | Owner |
|---|---|
| Responsive classes, chart rendering, chart labels | UI (`app/**`, `components/**`) |
| Chart aggregate derivation from scoped data | Service (`lib/services/dashboard-service.ts`) |
| Business scoping and current balances/statuses | Existing repositories via ports |
| Theme tokens | `app/globals.css` / shadcn generated components |

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Chart library | `recharts` | User selected a chart library; it is React-native and low-friction for the dashboard cards. |
| API contract | Prefer no public API change | The dashboard page can call services directly; avoiding API additions prevents unnecessary contract churn. |
| Mobile lists | Keep tables with local horizontal scroll | Smaller blast radius; existing table component already supports overflow. |
