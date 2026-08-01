/**
 * Dashboard period model: the single source of truth for "which slice of time
 * is the dashboard showing".
 *
 * Before this existed, every dashboard figure was hardcoded to the CURRENT
 * calendar month (`lib/services/dashboard-service.ts`'s old
 * `currentMonthPrefix(now)` + `recentMonthKeys(now, 6)` helpers, duplicated in
 * `expense-dashboard-service.ts`), so the moment a new month started the
 * previous month's numbers became unreachable from the dashboard. The screen
 * now reads a `?period=` query param and resolves it here.
 *
 * The resolved shape is deliberately a plain data object rather than a set of
 * `now`-based helpers: it carries BOTH the inclusive `from`/`to` range (fed
 * straight into the repositories' existing `from`/`to` list filters, which
 * compare `YYYY-MM-DD` strings) and the `chartMonths` bucket list the trend
 * charts iterate. Services never re-derive dates from `new Date()`.
 *
 * DATE CONVENTION: every date string here is built from LOCAL getters and
 * string concatenation, never `toISOString()` — see `lib/dates.ts`'s
 * file-level comment for why (Colombia is UTC-5, so a UTC round-trip silently
 * shifts the day). The only `Date` construction is `new Date(y, m, 0)`, read
 * exclusively for its day-of-month to get a month's last day, which is
 * timezone-stable and handles 28/29/30/31-day months — the same trick
 * `lib/services/payroll-period.ts`'s `computePeriod` already uses.
 */

import { daysAgoIsoDate, todayIsoDate } from "@/lib/dates";

/**
 * Trend-chart bucket count for the ranges that have no natural month span
 * (the rolling 30-day default, a single month, and "Todo").
 */
const DEFAULT_CHART_BUCKETS = 6;

export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type PeriodPreset = "last30" | "month" | "last3" | "last6" | "thisYear" | "all";

export type DashboardPeriod = {
  /** The canonical `?period=` value this resolved from — echo it back into links/exports. */
  key: string;
  preset: PeriodPreset;
  /** User-facing name, e.g. "Julio 2026" or "Últimos 3 meses". */
  label: string;
  /** Inclusive lower bound as local `YYYY-MM-DD`; `undefined` means unbounded ("Todo"). */
  from?: string;
  /** Inclusive upper bound as local `YYYY-MM-DD`; `undefined` means unbounded ("Todo"). */
  to?: string;
  /** `YYYY-MM` buckets for the trend charts, oldest first. Never empty. */
  chartMonths: string[];
};

const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "long" });
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "short" });

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `Date` → `"YYYY-MM"`, from local getters. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** `"YYYY-MM"` → `"YYYY-MM-01"`. */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** `"YYYY-MM"` → that month's last day as `"YYYY-MM-DD"`. */
export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7)); // 1-based
  const lastDay = new Date(year, monthNumber, 0).getDate(); // day 0 of the next month
  return `${month}-${pad(lastDay)}`;
}

/**
 * Long, capitalized month name for the selector and KPI labels, e.g.
 * `"2026-07"` → `"Julio 2026"`. `Intl` yields a lowercase month in Spanish;
 * the year is appended manually instead of using `{ month: "long", year:
 * "numeric" }` so the output is a stable `"Mes AAAA"` rather than locale-
 * dependent `"julio de 2026"`.
 */
export function monthLongLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const name = MONTH_NAME_FORMATTER.format(new Date(year, monthNumber - 1, 1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/**
 * Short month label for trend-chart axes, e.g. `"2026-07"` → `"jul"`. Shared
 * by both dashboard services, which each used to carry their own copy.
 */
export function monthShortLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return MONTH_SHORT_FORMATTER.format(new Date(year, monthNumber - 1, 1));
}

/** The `count` consecutive `YYYY-MM` keys ending at (and including) `endMonth`, oldest first. */
function monthsEndingAt(endMonth: string, count: number): string[] {
  const year = Number(endMonth.slice(0, 4));
  const monthNumber = Number(endMonth.slice(5, 7));
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    // `new Date(y, m, 1)` normalizes negative/overflowing month indexes, so
    // stepping back across a year boundary needs no manual wrap-around.
    return monthKey(new Date(year, monthNumber - 1 - offset, 1));
  });
}

/** The `YYYY-MM` keys of the current year up to and including `endMonth`, oldest first. */
function monthsOfYearUpTo(endMonth: string): string[] {
  const monthNumber = Number(endMonth.slice(5, 7));
  return monthsEndingAt(endMonth, monthNumber);
}

/**
 * Validity is deliberately just "well-formed and not in the future" — with no
 * lower bound. What the selector OFFERS is bounded by data
 * (`lib/services/dashboard-period-options.ts` lists only months with actual
 * movement); what `?period=` ACCEPTS must be at least as permissive, or a
 * business whose oldest invoice predates any fixed window would be offered a
 * month this function then rejected. Anything rejected falls back to the
 * current month; this never throws, matching `lib/pagination.ts`'s
 * `parsePageParam` posture that a bad query string must not 500.
 */
function isSelectableMonth(raw: string, currentMonth: string): boolean {
  return MONTH_KEY_PATTERN.test(raw) && raw <= currentMonth;
}

/**
 * Resolves a raw `?period=` value into the period every dashboard service and
 * section reads. Unknown/invalid values resolve to the last 30 days — the
 * dashboard's fixed window — and this never throws.
 *
 * Note the shape of the `switch`: month keys are matched EXPLICITLY in the
 * `default:` branch and everything else falls through to `last30`. It used to
 * be the reverse (unknown ⇒ current month), which would now quietly turn
 * `?period=garbage` into a calendar month instead of the default view.
 */
export function parsePeriodParam(raw: string | undefined, now: Date = new Date()): DashboardPeriod {
  const currentMonth = monthKey(now);

  switch (raw) {
    case "last3":
      return rollingPeriod("last3", "Últimos 3 meses", currentMonth, 3);
    case "last6":
      return rollingPeriod("last6", "Últimos 6 meses", currentMonth, 6);
    case "thisYear": {
      const months = monthsOfYearUpTo(currentMonth);
      return {
        key: "thisYear",
        preset: "thisYear",
        label: "Este año",
        from: monthStart(months[0]),
        to: monthEnd(currentMonth),
        chartMonths: months,
      };
    }
    case "all":
      return {
        key: "all",
        preset: "all",
        label: "Todo",
        // Both bounds undefined: the repositories' `list()` filters are
        // `if (query.from)` / `if (query.to)`, so this is literally "no date
        // filter" — identical to the all-time behavior that predates periods.
        from: undefined,
        to: undefined,
        chartMonths: monthsEndingAt(currentMonth, DEFAULT_CHART_BUCKETS),
      };
    default: {
      if (raw && isSelectableMonth(raw, currentMonth)) {
        return {
          key: raw,
          preset: "month",
          label: monthLongLabel(raw),
          from: monthStart(raw),
          to: monthEnd(raw),
          // A single-bar trend chart is useless, so a month still charts the 6
          // months ENDING at it — the surrounding trend is the point of those charts.
          chartMonths: monthsEndingAt(raw, DEFAULT_CHART_BUCKETS),
        };
      }
      return lastThirtyDays(now, currentMonth);
    }
  }
}

/**
 * The dashboard's fixed window, and the default for everything else.
 *
 * 30 days INCLUDING today, hence `days - 1` back from `now`. Unlike every
 * other period here, this one ends TODAY rather than at a month end — that is
 * the whole point of a rolling window, and it stays deterministic under test
 * because `now` is injected.
 */
function lastThirtyDays(now: Date, currentMonth: string): DashboardPeriod {
  return {
    key: "last30",
    preset: "last30",
    label: "Últimos 30 días",
    from: daysAgoIsoDate(29, now),
    to: todayIsoDate(now),
    // The trend charts stay month-bucketed: 30 days is one and a bit bars,
    // which says nothing about a trend. Each chart names its own six-month
    // window in its description so the mismatch is stated, not hidden.
    chartMonths: monthsEndingAt(currentMonth, DEFAULT_CHART_BUCKETS),
  };
}

function rollingPeriod(key: string, label: string, currentMonth: string, months: number): DashboardPeriod {
  const chartMonths = monthsEndingAt(currentMonth, months);
  return {
    key,
    preset: key as PeriodPreset,
    label,
    from: monthStart(chartMonths[0]),
    // The calendar end of the current month, not today: there is no
    // future-dated data to over-include, and this keeps the range a pure
    // function of the ending month (deterministic in tests).
    to: monthEnd(currentMonth),
    chartMonths,
  };
}

export type PeriodOption = { value: string; label: string };

/**
 * The non-month ranges the EXPORT menu offers, above its data-driven month
 * list (`lib/services/dashboard-period-options.ts`). Unconditional — these are
 * pure date math and always make sense, even for a business with no data at
 * all; keeping them here preserves this module's pure/sync nature.
 *
 * `last30` leads because it is what the screen shows: exporting it gives you
 * the file that matches what you were just looking at.
 *
 * Takes no `now`: unlike everything else in this module, the option LIST is
 * date-independent — each option resolves against `now` later, in
 * `parsePeriodParam`.
 */
export function presetOptions(): PeriodOption[] {
  return [
    { value: "last30", label: "Últimos 30 días" },
    { value: "last3", label: "Últimos 3 meses" },
    { value: "last6", label: "Últimos 6 meses" },
    { value: "thisYear", label: "Este año" },
    { value: "all", label: "Todo" },
  ];
}

/**
 * `period.label` on its own reads fine as a caption next to a number
 * (`StatCard`'s `hint`, e.g. "julio 2026"), but dropped straight into a
 * sentence the rolling-window presets are missing their article: "No
 * recibiste pagos en últimos 30 días" is broken Spanish. This is the sentence
 * form — "los últimos 30 días", "este año", "todo el periodo" — so
 * `recent-payments.tsx`/`recent-expenses.tsx` can build a natural empty-state
 * message for every preset. A month key needs nothing extra (`period.label`
 * already reads correctly after "en"), so it falls through unchanged.
 */
export function periodRangeLabel(period: DashboardPeriod): string {
  switch (period.preset) {
    case "last30":
      return "los últimos 30 días";
    case "last3":
      return "los últimos 3 meses";
    case "last6":
      return "los últimos 6 meses";
    case "thisYear":
      return "este año";
    case "all":
      return "todo el periodo";
    default:
      return period.label.toLowerCase();
  }
}
