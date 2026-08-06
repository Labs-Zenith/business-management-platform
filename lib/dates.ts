/**
 * Date helpers for the whole app.
 *
 * Convention: dates the user perceives as "today" must always be computed
 * from LOCAL time getters, never `Date.prototype.toISOString()` (which is
 * always UTC). For this app's target locale (Colombia, UTC-5, no DST), a
 * user filling out a form in the evening local time has already rolled into
 * tomorrow in UTC — `.toISOString().slice(0, 10)` would silently pre-fill
 * the wrong day.
 */

/** A `Date` as a local `YYYY-MM-DD` string (not UTC). */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Today's date as a local `YYYY-MM-DD` string (not UTC). `now` is injectable
 * so callers that must be deterministic under test (the dashboard's rolling
 * window) don't have to freeze the clock.
 *
 * "Local" here means the PROCESS's own ambient timezone (`getFullYear()` /
 * `getMonth()` / `getDate()`), which is only correct when the process IS the
 * timezone you want — true for every current caller of this function, all
 * `"use client"` components where "local" is the user's own browser. It is
 * NOT correct for server-side code: this app's Vercel deployment runs UTC, so
 * calling `todayIsoDate` there would compute "today" up to 5 hours early for
 * a Bogota user. Server-side code that needs the BUSINESS's calendar day
 * (regardless of what timezone the server process happens to be running in)
 * must use `todayIsoDateInAppZone` below instead. Do not merge these two into
 * one function — they deliberately answer different questions ("what day is
 * it where THIS PROCESS is" vs. "what day is it in the business's own
 * timezone"), and the difference is exactly the bug class this file exists to
 * prevent.
 */
export function todayIsoDate(now: Date = new Date()): string {
  return isoDate(now);
}

/**
 * The app's fixed business timezone (Colombia, UTC-5, no DST). Exported so
 * every place that needs "Colombia's clock" specifically — as opposed to
 * whatever timezone the running process happens to be in — shares one
 * literal instead of re-typing the IANA zone name (previously duplicated
 * across the two `Intl.DateTimeFormat`s below).
 */
export const APP_TIME_ZONE = "America/Bogota";

/**
 * `Intl.DateTimeFormat("en-CA", ...)` is used purely as a formatting trick:
 * `en-CA` is the one built-in locale whose default date format is already
 * `YYYY-MM-DD`, so no manual part assembly (`getFullYear`/`getMonth`/...) is
 * needed — and, critically, `Intl.DateTimeFormat` with an explicit `timeZone`
 * option converts the given instant into that zone regardless of the
 * process's own ambient timezone, which local `Date` getters cannot do.
 */
const APP_ZONE_ISO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE });

/**
 * An instant as a `YYYY-MM-DD` string in `APP_TIME_ZONE`, independent of the
 * process's own ambient timezone. Defaults to `now` (mirroring
 * `todayIsoDate`'s shape) so its main use is "what day is it for the business
 * right now", but it is equally correct applied to any other instant — which
 * is exactly why `lib/services/status.ts#computeStatus` reuses it to
 * normalize a due-date `Date` onto the same zone before comparing it against
 * "today".
 *
 * Use this instead of `todayIsoDate` for anything that runs SERVER-SIDE
 * (API routes, services) and needs "today" to mean the Colombian business's
 * calendar day rather than the deploy platform's UTC day. See `todayIsoDate`
 * above for the full rationale; the two are intentionally NOT the same
 * function.
 */
export function todayIsoDateInAppZone(now: Date = new Date()): string {
  return APP_ZONE_ISO_DATE_FORMATTER.format(now);
}

/**
 * The date `days` before `now`, as a local `YYYY-MM-DD` string.
 *
 * `new Date(y, m, d - days)` is deliberate: the `Date` constructor normalizes
 * an out-of-range day, so stepping back across a month boundary, a year
 * boundary or a leap day needs no special casing. Doing the same arithmetic on
 * a timestamp (`getTime() - days * 86_400_000`) would be wrong across a DST
 * change; doing it via `toISOString()` would be wrong every evening at UTC-5.
 */
export function daysAgoIsoDate(days: number, now: Date = new Date()): string {
  return isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

/**
 * Day + month, no year: "3 de jul". For naming a date range in UI copy, where
 * the year is either obvious or stated once. Same Colombian locale/timezone
 * rationale as `formatDateTime` below.
 */
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  timeZone: APP_TIME_ZONE,
});

/**
 * Two local `YYYY-MM-DD` strings → "Del 3 de jul al 1 de ago". Used for the
 * dashboard's rolling window, so the heading "Últimos 30 días" is backed by
 * the actual dates rather than leaving the reader to guess them.
 *
 * Parsed as `YYYY-MM-DDT12:00:00` (local midday, NOT bare `new Date(iso)`,
 * which JS parses as UTC midnight and would render the previous day at UTC-5).
 */
export function formatDateRange(fromIso: string, toIso: string): string {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${fromIso} - ${toIso}`;
  return `Del ${DAY_MONTH_FORMATTER.format(from)} al ${DAY_MONTH_FORMATTER.format(to)}`;
}

/**
 * User-facing date + time formatter, fixed to Colombian locale + timezone so a
 * SERVER-rendered timestamp (the runtime is UTC on Vercel) shows in the
 * business's local time rather than UTC — same UTC-5 rationale as
 * `todayIsoDate` above. Built once (constructing an `Intl.DateTimeFormat` is
 * comparatively expensive).
 */
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

/**
 * ISO timestamp → localized date + time (e.g. "1 de jul de 2026, 7:00 a. m.").
 * Returns "-" for empty input and echoes the raw string back if it is not a
 * parseable date, so a bad value never throws in a render path.
 */
export function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return DATE_TIME_FORMATTER.format(date);
}
