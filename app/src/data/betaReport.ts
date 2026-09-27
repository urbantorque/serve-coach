/**
 * The closed-beta report (docs/MONETISATION.md §8, PRODUCT §9.1 to §9.4): the gate measures worked out
 * on this phone from the local events table, plus the events themselves. The tester sees it in
 * Profile > Beta data and may export it and choose to send it; nothing is sent by the app (D8).
 *
 * Definitions (research 08 §8.1, PRODUCT §9.1), as computed here:
 * - Activation: within 7 days of the first open, one valid analysed session (10 or more serves found,
 *   capture Fair or Good) and then the coaching decision opened (Focus and drill, or its drill).
 * - Loop completion: a re-test analysed within 14 days of its baseline whose "Did it work?" verdict was
 *   something other than "Not comparable yet".
 * - Active week: at least one analysed session or one logged practice in the week.
 * - Usefulness: share of ratings of 4 or 5 out of 5.
 * Times are bucketed to the hour, so a window edge can be off by up to an hour.
 */
import { randomRef } from '../platform/ids.ts'
import { APP_VERSION } from './export.ts'
import type { EventRecord } from './records.ts'
import { EVENT_NAMES, listEvents, purgeUnknownEvents, type EventName, type EventProps } from './repos/events.ts'
import { getSetting, setSetting } from './repos/settings.ts'

export const BETA_REPORT_FORMAT = 'serve-coach-beta-report'
export const BETA_REPORT_VERSION = 1
export const ACTIVATION_DAYS = 7
export const LOOP_DAYS = 14
/** Weeks after activation reported one by one (W1 to W8, PRODUCT §9.1). */
export const WEEKS_AFTER_ACTIVATION = 8

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export interface WeekActivity {
  /** ISO week of the phone's local calendar, e.g. "2026-W40". */
  week: string
  sessions: number
  practice: number
}

export interface GateSummary {
  firstOpenedAt: string | null
  activation: {
    /** met: both steps inside the window; open: the window is still running; missed: it closed without both. */
    status: 'met' | 'open' | 'missed' | 'not-started'
    windowEndsAt: string | null
    validSessionAt: string | null
    focusOpenedAt: string | null
  }
  loopCompletion: { loops: number; firstAt: string | null }
  weekly: {
    weeks: WeekActivity[]
    activeWeeks: number
    /**
     * Week n after activation (week 1 = the 7 days from local midnight of the activating session's
     * day); only weeks that have started.
     */
    afterActivation: { week: number; active: boolean }[]
  }
  usefulness: { rated: number; fourOrFive: number; skipped: number; byRating: Record<'1' | '2' | '3' | '4' | '5', number> }
  counts: Record<EventName, number>
}

const time = (e: EventRecord) => new Date(e.at).getTime()

/** Events in time order; equal hour buckets keep their insertion order. */
function ordered(events: readonly EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => time(a) - time(b) || (a.seq ?? 0) - (b.seq ?? 0))
}

/** ISO 8601 week of a local date: "2026-W40". */
export function isoWeek(d: Date): string {
  // The local calendar date, moved to the Thursday of its week (which decides the ISO year).
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const isActivity = (e: EventRecord) => e.name === 'analysis_completed' || e.name === 'practice_logged'

export function computeGates(events: readonly EventRecord[], now: Date = new Date()): GateSummary {
  const list = ordered(events)
  const counts = Object.fromEntries(EVENT_NAMES.map((n) => [n, 0])) as Record<EventName, number>
  for (const e of list) if (e.name in counts) counts[e.name as EventName]++

  const first = list.find((e) => e.name === 'app_first_opened') ?? list[0]
  const firstOpenedAt = first ? first.at : null

  // Activation.
  let activation: GateSummary['activation'] = { status: 'not-started', windowEndsAt: null, validSessionAt: null, focusOpenedAt: null }
  let activatedAtMs: number | null = null
  if (first) {
    const start = time(first)
    const end = start + ACTIVATION_DAYS * DAY_MS
    const inWindow = (e: EventRecord) => time(e) >= start && time(e) <= end
    const validIndex = list.findIndex((e) => e.name === 'analysis_completed' && e.props.valid === true && inWindow(e))
    const valid = validIndex >= 0 ? list[validIndex] : undefined
    const focus = valid ? list.slice(validIndex + 1).find((e) => (e.name === 'focus_opened' || e.name === 'drill_started') && inWindow(e)) : undefined
    const met = Boolean(valid && focus)
    // Weeks after activation start at local midnight of the activating session's day (week 1 holds it).
    if (met) {
      const d = new Date(valid!.at)
      activatedAtMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    }
    activation = {
      status: met ? 'met' : now.getTime() <= end ? 'open' : 'missed',
      windowEndsAt: new Date(end).toISOString(),
      validSessionAt: valid?.at ?? null,
      focusOpenedAt: focus?.at ?? null,
    }
  }

  // Loop completion: counted when the verdict is viewed (the verdict is what completes the loop).
  const loops = list.filter((e) => e.name === 'verdict_viewed' && e.props.retestWithin14d === true && e.props.verdict !== 'not-comparable')

  // Weekly activity.
  const byWeek = new Map<string, WeekActivity>()
  for (const e of list.filter(isActivity)) {
    const week = isoWeek(new Date(e.at))
    const row = byWeek.get(week) ?? { week, sessions: 0, practice: 0 }
    if (e.name === 'analysis_completed') row.sessions++
    else row.practice++
    byWeek.set(week, row)
  }
  const afterActivation: { week: number; active: boolean }[] = []
  if (activatedAtMs !== null) {
    for (let w = 1; w <= WEEKS_AFTER_ACTIVATION; w++) {
      const from = activatedAtMs + (w - 1) * WEEK_MS
      if (from > now.getTime()) break
      const to = from + WEEK_MS
      afterActivation.push({ week: w, active: list.some((e) => isActivity(e) && time(e) >= from && time(e) < to) })
    }
  }

  // Usefulness.
  const byRating = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const e of list) {
    if (e.name !== 'usefulness_rated') continue
    const r = String(e.props.rating) as keyof typeof byRating
    if (r in byRating) byRating[r]++
  }
  const rated = Object.values(byRating).reduce((a, b) => a + b, 0)

  return {
    firstOpenedAt,
    activation,
    loopCompletion: { loops: loops.length, firstAt: loops[0]?.at ?? null },
    weekly: { weeks: [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)), activeWeeks: byWeek.size, afterActivation },
    usefulness: { rated, fourOrFive: byRating['4'] + byRating['5'], skipped: counts.usefulness_skipped, byRating },
    counts,
  }
}

export interface BetaReport {
  format: typeof BETA_REPORT_FORMAT
  version: typeof BETA_REPORT_VERSION
  exportedAt: string
  app: { version: string; platform: 'pwa' | 'ios'; display: 'browser' | 'standalone' | 'unknown' }
  /** Random, not linked to the player, resettable in Profile > Beta data. */
  installRef: string
  definitions: Record<'activation' | 'loopCompletion' | 'activeWeek' | 'usefulness' | 'times', string>
  gates: GateSummary
  events: { name: string; at: string; props: EventProps }[]
  notes: string
}

export const BETA_DEFINITIONS: BetaReport['definitions'] = {
  activation:
    'Within 7 days of the first open: one analysed session with 10 or more serves and capture Fair or Good, then Focus and drill opened.',
  loopCompletion: 'A re-test analysed within 14 days of its baseline whose “Did it work?” verdict was not “Not comparable yet”.',
  activeWeek: 'At least one analysed session or one logged practice in the week.',
  usefulness: 'Ratings of “How useful is this change for you?” (1 to 5), asked once after each verdict. Skips are counted.',
  times: 'Every time is rounded down to the hour (UTC).',
}

/** The install reference, created the first time a report needs one. */
export async function betaInstallRef(): Promise<string> {
  const current = await getSetting('betaInstallRef')
  if (current) return current
  const ref = randomRef(10)
  await setSetting('betaInstallRef', ref)
  return ref
}

/** "Reset reference": the next report carries a new random reference. */
export async function resetBetaInstallRef(): Promise<string> {
  const ref = randomRef(10)
  await setSetting('betaInstallRef', ref)
  return ref
}

export async function buildBetaReport(
  options: { now?: Date; platform?: 'pwa' | 'ios'; display?: 'browser' | 'standalone' | 'unknown' } = {},
): Promise<BetaReport> {
  const now = options.now ?? new Date()
  // An older build's rows for events that left the catalogue never reach a report (listEvents skips them too).
  await purgeUnknownEvents()
  const events = await listEvents()
  return {
    format: BETA_REPORT_FORMAT,
    version: BETA_REPORT_VERSION,
    exportedAt: now.toISOString(),
    app: { version: APP_VERSION, platform: options.platform ?? 'pwa', display: options.display ?? 'unknown' },
    installRef: await betaInstallRef(),
    definitions: BETA_DEFINITIONS,
    gates: computeGates(events, now),
    // The once-keys are local bookkeeping; they never leave the phone.
    events: events.map((e) => ({ name: e.name, at: e.at, props: { ...e.props } })),
    notes:
      'Made on this phone from local usage counts. No video, images, pose data, sound, notes, heights, body-check answers, referrals or ids are in it. Serve Coach did not send it anywhere; you chose where it goes.',
  }
}
