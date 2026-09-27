/**
 * Date formatting (DESIGN §4.3): "Sat 26 Sep" in lists and headers, "26 Sep 2026" in exports,
 * "Sunday 27 September" under Today's title. Built by hand so output is identical in every runtime.
 */
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A local calendar date (YYYY-MM-DD, e.g. a session's visitId) as a Date at local noon. */
function fromLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** "Sat 26 Sep" from a local date string (visitId) or a Date. */
export function shortDate(input: string | Date): string {
  const d = typeof input === 'string' ? fromLocalDate(input) : input
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`
}

/** "26 Sep 2026". */
export function exportDate(input: string | Date): string {
  const d = typeof input === 'string' ? fromLocalDate(input) : input
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** "Sunday 27 September". */
export function longDate(d: Date = new Date()): string {
  return `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]}`
}

/** "September 2026" (Sessions month groups). */
export function monthYear(ymd: string): string {
  const d = fromLocalDate(ymd)
  return `${MON_LONG[d.getMonth()]} ${d.getFullYear()}`
}
