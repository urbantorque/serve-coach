/**
 * Words for Profile > Beta data (docs/MONETISATION.md §8; PRODUCT §9.4 "visible to the player"). Pure,
 * so the copy and the gate sentences are unit-tested. Australian English, no dashes, no exclamation marks.
 */
import type { EventName, GateSummary } from '../../../../data/index.ts'
import type { EventRecord } from '../../../../data/records.ts'
import { shortDate } from '../../../format/dates.ts'

/** What each counted event means, in the player's words. */
export const EVENT_LABEL: Record<EventName, string> = {
  app_first_opened: 'First opened',
  analysis_completed: 'Session analysed',
  focus_opened: 'Focus and drill opened',
  drill_started: 'Drill started',
  drill_completed: 'Drill finished',
  practice_logged: 'Practice logged',
  verdict_viewed: '“Did it work?” seen',
  usefulness_rated: 'Usefulness rated',
  usefulness_skipped: 'Usefulness skipped',
  paywall_viewed: 'Plus offer seen',
  recording_recovered: 'Interrupted recording',
  storage_persist_requested: 'Storage protection asked',
}

/** The counts table, in this order, with the plural used for the number. */
export const COUNT_ROWS: { name: EventName; one: string; many: string }[] = [
  { name: 'analysis_completed', one: 'Session analysed', many: 'Sessions analysed' },
  { name: 'focus_opened', one: 'Focus opened', many: 'Focus opened' },
  { name: 'drill_started', one: 'Drill started', many: 'Drills started' },
  { name: 'drill_completed', one: 'Drill finished', many: 'Drills finished' },
  { name: 'practice_logged', one: 'Practice logged', many: 'Practices logged' },
  { name: 'verdict_viewed', one: 'Verdict seen', many: 'Verdicts seen' },
  { name: 'usefulness_rated', one: 'Usefulness rating', many: 'Usefulness ratings' },
  { name: 'paywall_viewed', one: 'Plus offer seen', many: 'Plus offers seen' },
  { name: 'recording_recovered', one: 'Interrupted recording', many: 'Interrupted recordings' },
]

export const NEVER_RECORDED = [
  'No video, images, pose data or sound.',
  'No notes, heights, UTR, body-check answers or referrals.',
  'No names, ids, location or device details.',
] as const

const at = (iso: string) => shortDate(new Date(iso))

export interface GateLine {
  id: 'activation' | 'loop' | 'weeks' | 'usefulness'
  title: string
  status: string
  detail: string
}

/** The four beta checks as sentences (counts of what happened on this phone, never a score). */
export function gateLines(g: GateSummary, now: Date = new Date()): GateLine[] {
  const a = g.activation
  const daysLeft = a.windowEndsAt ? Math.max(0, Math.ceil((new Date(a.windowEndsAt).getTime() - now.getTime()) / 86_400_000)) : 0
  const activation: GateLine = {
    id: 'activation',
    title: 'First week',
    status: a.status === 'met' ? 'Done' : a.status === 'open' ? 'Not yet' : a.status === 'missed' ? 'Not within 7 days' : 'Not started',
    detail:
      a.status === 'met'
        ? `A session with 10 or more serves on ${at(a.validSessionAt!)}, then your focus opened.`
        : a.status === 'open'
          ? a.validSessionAt
            ? `Session done on ${at(a.validSessionAt)}. Open your focus to finish this. ${daysLeft === 1 ? '1 day' : `${daysLeft} days`} left.`
            : `Analyse a session with 10 or more serves, then open your focus. ${daysLeft === 1 ? '1 day' : `${daysLeft} days`} left.`
          : a.status === 'missed'
            ? 'The first 7 days have passed. Everything else still counts.'
            : 'Starts when you first open Serve Coach.',
  }
  const loops = g.loopCompletion.loops
  const loop: GateLine = {
    id: 'loop',
    title: 'Re-test within 14 days',
    status: loops === 0 ? 'Not yet' : loops === 1 ? '1 loop' : `${loops} loops`,
    detail:
      loops === 0
        ? 'Practise, record a re-test within 14 days of your first session, then see “Did it work?”.'
        : `First on ${at(g.loopCompletion.firstAt!)}. A loop counts when the verdict can compare the two sessions.`,
  }
  const active = g.weekly.activeWeeks
  const weeks: GateLine = {
    id: 'weeks',
    title: 'Active weeks',
    status: active === 1 ? '1 week' : `${active} weeks`,
    detail: 'Weeks with at least one analysed session or logged practice.',
  }
  const u = g.usefulness
  const usefulness: GateLine = {
    id: 'usefulness',
    title: 'Usefulness',
    status: u.rated === 0 ? 'No ratings yet' : `${u.fourOrFive} of ${u.rated} rated 4 or 5`,
    detail: u.skipped ? `Asked after each verdict. You skipped it ${u.skipped === 1 ? 'once' : `${u.skipped} times`}.` : 'Asked once after each verdict.',
  }
  return [activation, loop, weeks, usefulness]
}

const KEY_WORDS: Record<string, string> = {
  serves: 'serves',
  capture: 'capture',
  valid: 'counts for the first week',
  view: 'view',
  source: 'from',
  retest: 're-test',
  sinceBaseline: 'days since first session',
  minutes: 'minutes',
  success: 'goal met',
  feel: 'feel',
  cueHelpful: 'cue helped',
  verdict: 'verdict',
  retestWithin14d: 'within 14 days',
  sameSession: 'same session',
  rating: 'rating',
  trigger: 'shown from',
  choice: 'choice',
  length: 'length',
  result: 'answer',
  from: 'asked from',
  display: 'opened as',
  platform: 'app',
}

const TRIGGER_WORDS: Record<string, string> = {
  plan: 'the Plan row',
  t1: 'the card after your first loop',
  t2: 'the monthly allowance note',
  t3: 'a Plus feature',
}

/** Whole phrases for values that read badly as "key value" (the key is dropped). */
const PHRASES: Record<string, string> = {
  'display:browser': 'opened in the browser',
  'display:standalone': 'opened from the Home Screen',
  'platform:pwa': 'web app',
  'platform:ios': 'iPhone app',
  'source:recorded': 'recorded in the app',
  'source:imported': 'imported',
  'source:recovered': 'recovered recording',
  'sinceBaseline:none': '',
  'from:first-session': 'asked at the first session',
  'from:storage-screen': 'asked from Storage and privacy',
}

/** A stored value in words: "15-24" reads "15 to 24", "25+" reads "25 or more", yes/no for flags. */
export function valueWords(key: string, v: string | number | boolean): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return String(v)
  if (key === 'trigger') return TRIGGER_WORDS[v] ?? v
  if (v === 'unset') return 'not answered'
  if (v === 'none') return 'not a re-test'
  const range = /^(\d+)-(\d+)(-min)?$/.exec(v)
  if (range) return `${range[1]} to ${range[2]}${range[3] ? ' min' : ''}`
  if (/^\d+\+$/.test(v)) return `${v.slice(0, -1)} or more`
  return v.replace(/-/g, ' ')
}

/** One event as a line: "Session analysed", "Sat 26 Sep, 6 pm", "serves 15 to 24, capture good". */
export function eventLine(e: EventRecord): { title: string; when: string; detail: string } {
  const d = new Date(e.at)
  const h = d.getHours()
  const hour = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`
  const detail = Object.entries(e.props)
    .map(([k, v]) => {
      const phrase = PHRASES[`${k}:${String(v)}`]
      return phrase !== undefined ? phrase : `${KEY_WORDS[k] ?? k} ${valueWords(k, v)}`
    })
    .filter(Boolean)
    .join(', ')
  return { title: EVENT_LABEL[e.name as EventName] ?? e.name, when: `${shortDate(d)}, ${hour}`, detail }
}
