/**
 * The week plan as a calendar file (M3.1).
 *
 * No server means no reminders from this app; the phone's own calendar can do
 * it. This writes an RFC 5545 file: the next three practice sessions, spaced by
 * the player's cadence, each the length they said they have, with today's plan
 * in its notes and an alarm an hour before. The file leaves the device only if
 * the player shares it.
 *
 * Stable UIDs, one per session date, so exporting again updates the events a
 * calendar already holds instead of adding copies.
 */
import { courtPlan, type CourtMinutes } from './courtPlan'
import type { Cadence } from './storage/prefs'
import type { WeekPlan } from './weekPlan'

const CRLF = '\r\n'
const GAP_DAYS: Record<Cadence, number> = { weekly: 7, fortnightly: 14, monthly: 30 }

/** Text as a value: backslash, semicolon, comma and newline escaped (RFC 5545 §3.3.11). */
export const escapeText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/**
 * One content line folded at 75 octets, continuation lines starting with a
 * space (§3.1). Counted in UTF-8 bytes, and never splitting a character.
 */
export function fold(line: string): string {
  const enc = new TextEncoder()
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = out.length ? 74 : 75
    if (bytes + n > limit) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += n
  }
  out.push(current)
  return out.join(CRLF + ' ')
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Floating local time: the session is at six in the evening wherever the phone is. */
const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const utc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

/** The next session dates: the day after tomorrow, then every gap the cadence says. */
export function sessionDates(now: Date, cadence: Cadence | undefined, count = 3): Date[] {
  const gap = GAP_DAYS[cadence ?? 'weekly']
  return Array.from({ length: count }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2 + i * gap, 18, 0, 0))
}

export function weekCalendar(week: WeekPlan, opts: { now: Date; cadence?: Cadence; minutes: CourtMinutes }): string {
  const plan = courtPlan(week, opts.minutes)
  const notes = plan.map((b) => `${b.minutes} min: ${b.line}`).join('\n')
  const summary = week.items[0] ? `Serve practice: ${week.items[0].drill.name}` : 'Serve practice'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Serve Coach//Week plan//EN', 'CALSCALE:GREGORIAN']
  for (const start of sessionDates(opts.now, opts.cadence)) {
    const end = new Date(start.getTime() + opts.minutes * 60_000)
    const day = local(start).slice(0, 8)
    lines.push(
      'BEGIN:VEVENT',
      `UID:serve-coach-plan-${day}@serve-coach.local`,
      `DTSTAMP:${utc(opts.now)}`,
      `DTSTART:${local(start)}`,
      `DTEND:${local(end)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(notes)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(summary)}`,
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join(CRLF) + CRLF
}
