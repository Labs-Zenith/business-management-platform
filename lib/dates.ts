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
