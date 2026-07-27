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

/** Today's date as a local `YYYY-MM-DD` string (not UTC). */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  timeZone: "America/Bogota",
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
