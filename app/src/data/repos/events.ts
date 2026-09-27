/**
 * Local usage events for the closed-beta gates (ARCHITECTURE §7.1 EventRecord, §9 item 8; PRODUCT §9.3,
 * §9.4; docs/MONETISATION.md §8). Everything stays on this phone: rows are written only through
 * `recordEvent()`, which checks every property against the catalogue below (enums, buckets and yes/no
 * only), buckets the time to the hour, and drops anything else. No free text, no heights or UTR values,
 * no body-check answers and no pain or referral event at all (not even a count), no ids, no location. Kept 180 days (retention.ts), shown in Profile >
 * Beta data, wiped by "Delete everything". The tester may export a report and choose to send it; the app
 * never sends anything (D8).
 */
import { getDb } from '../db.ts'
import type { EventRecord } from '../records.ts'

type Rule = readonly string[] | 'bool' | { int: readonly [number, number] }

export const SERVE_BUCKETS = ['0', '1-4', '5-9', '10-14', '15-24', '25+'] as const
export const MINUTE_BUCKETS = ['0-4', '5-9', '10-14', '15-29', '30+'] as const
export const DAY_BUCKETS = ['0-7', '8-14', '15-28', '29+'] as const
export const LENGTH_BUCKETS = ['under-1-min', '1-4-min', '5-9-min', '10-min-plus'] as const
export const VERDICT_IDS = [
  'clearly-better',
  'likely-better',
  'about-the-same',
  'too-early',
  'likely-worse',
  'clearly-worse',
  'not-comparable',
  'trend-too-early',
] as const

const answer = (...values: string[]) => [...values, 'unset'] as const

/**
 * The event catalogue. Each property is optional but, when present, must match its rule; an unknown
 * property or name drops the whole event (it is counted, never stored).
 */
export const EVENT_SCHEMAS = {
  /** Once, the first time this build opens: the start of the 7-day activation window. */
  app_first_opened: { display: ['browser', 'standalone'], platform: ['pwa', 'ios'] },
  /** A player's session finished analysing (never the sample). `valid`: 10+ serves and capture Fair or Good. */
  analysis_completed: {
    serves: SERVE_BUCKETS,
    capture: ['good', 'fair', 'limited'],
    valid: 'bool',
    view: ['side', 'rear', 'other'],
    source: ['recorded', 'imported', 'recovered'],
    retest: 'bool',
    sinceBaseline: [...DAY_BUCKETS, 'none'],
  },
  /** Focus and drill opened (the coaching decision). */
  focus_opened: {},
  drill_started: {},
  drill_completed: { minutes: MINUTE_BUCKETS },
  practice_logged: {
    minutes: MINUTE_BUCKETS,
    success: answer('yes', 'partly', 'no'),
    feel: answer('natural', 'ok', 'awkward'),
    cueHelpful: answer('yes', 'not-sure', 'no'),
  },
  /** "Did it work?" shown with a verdict; once per experiment and verdict. */
  verdict_viewed: { verdict: VERDICT_IDS, retestWithin14d: 'bool', sameSession: 'bool' },
  /** "How useful is this change for you?" after a verdict; once per experiment. */
  usefulness_rated: { rating: { int: [1, 5] } },
  usefulness_skipped: {},
  /** The plan screen or a Plus sheet was shown (trigger: PRODUCT §6.15 moments, or the Profile plan row). */
  paywall_viewed: { trigger: ['plan', 't1', 't2', 't3'] },
  // No pain, referral or body-check event exists, not even a count: they are health information and
  // stay entirely out of analytics (PRODUCT §9.4; COACHING §10). The safety gate is checked by the
  // coaching safety tests and the copy audit, not by telemetry.
  /** An interrupted in-app recording was found on launch and the player chose what to do. */
  recording_recovered: { choice: ['analyse', 'delete'], length: LENGTH_BUCKETS },
  /** navigator.storage.persist() was asked at the first saved session, or again from Storage and privacy. */
  storage_persist_requested: { result: ['granted', 'denied', 'unsupported'], from: ['first-session', 'storage-screen'] },
} as const satisfies Record<string, Record<string, Rule>>

export type EventName = keyof typeof EVENT_SCHEMAS
export const EVENT_NAMES = Object.keys(EVENT_SCHEMAS) as EventName[]
export type EventProps = Record<string, string | number | boolean>

let dropped = 0

/** Events refused by the schema since this page loaded (for tests and the Beta data screen). */
export function droppedEventCount(): number {
  return dropped
}

function fits(rule: Rule, value: unknown): boolean {
  if (rule === 'bool') return typeof value === 'boolean'
  if (Array.isArray(rule)) return typeof value === 'string' && (rule as readonly string[]).includes(value)
  const [lo, hi] = (rule as { int: readonly [number, number] }).int
  return typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi
}

/** True when the name is in the catalogue and every property is known and within its rule. */
export function validateEvent(name: string, props: EventProps): name is EventName {
  const schema = (EVENT_SCHEMAS as Record<string, Record<string, Rule>>)[name]
  if (!schema) return false
  return Object.entries(props).every(([key, value]) => key in schema && fits(schema[key], value))
}

/** The instant floored to the hour, as UTC ISO 8601 (sorts and compares as a string). */
export function hourBucket(d: Date): string {
  const t = new Date(d.getTime())
  t.setUTCMinutes(0, 0, 0)
  return t.toISOString()
}

/** FNV-1a (32 bit) as 8 hex characters: turns a record id into a dedupe key that is not the id. */
export function onceHash(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export interface RecordOptions {
  /** Record at most once per name and key (the key is hashed before it is stored). */
  once?: string
  now?: Date
}

/**
 * Writes one event. Returns false (and writes nothing) when the event is not in the catalogue, a
 * property breaks its rule, the `once` key was already recorded, or storage is unavailable. Never throws:
 * instrumentation must not break the flow that called it.
 */
export async function recordEvent(name: EventName, props: EventProps = {}, options: RecordOptions = {}): Promise<boolean> {
  if (!validateEvent(name, props)) {
    dropped++
    return false
  }
  const row: EventRecord = { name, at: hourBucket(options.now ?? new Date()), props: { ...props } }
  if (options.once !== undefined) row.onceKey = onceHash(`${name}:${options.once}`)
  try {
    const db = getDb()
    return await db.transaction('rw', db.events, async () => {
      if (row.onceKey) {
        const seen = await db.events
          .where('name')
          .equals(name)
          .filter((e) => e.onceKey === row.onceKey)
          .count()
        if (seen > 0) return false
      }
      await db.events.add(row)
      return true
    })
  } catch {
    return false
  }
}

/** True when an event with this name (and `once` key, when given) is already stored. */
export async function hasEvent(name: EventName, once?: string): Promise<boolean> {
  try {
    const key = once === undefined ? undefined : onceHash(`${name}:${once}`)
    const n = await getDb()
      .events.where('name')
      .equals(name)
      .filter((e) => key === undefined || e.onceKey === key)
      .count()
    return n > 0
  } catch {
    return false
  }
}

/**
 * Every stored catalogue event, oldest first. Rows whose name is no longer in the catalogue (an older
 * build's `pain_referral_shown`) are never shown or reported; `purgeUnknownEvents` removes them. Read
 * only, so it is safe inside a live query.
 */
export async function listEvents(): Promise<EventRecord[]> {
  const known = new Set<string>(EVENT_NAMES)
  return (await getDb().events.orderBy('seq').toArray()).filter((e) => known.has(e.name))
}

/** Deletes stored events whose name left the catalogue (run by the retention sweep and the beta report). */
export async function purgeUnknownEvents(): Promise<number> {
  try {
    const known = new Set<string>(EVENT_NAMES)
    return await getDb()
      .events.filter((e) => !known.has(e.name))
      .delete()
  } catch {
    return 0
  }
}

/** The Beta data screen's "Clear usage events" (Delete everything also clears them). */
export async function clearEvents(): Promise<number> {
  const db = getDb()
  return db.transaction('rw', db.events, db.deletionLog, async () => {
    const n = await db.events.count()
    await db.events.clear()
    if (n) await db.deletionLog.add({ at: new Date().toISOString(), scope: 'events-sweep', counts: { events: n } })
    return n
  })
}

// ----- Buckets (so callers never store raw values) -----

export function servesBucket(n: number): (typeof SERVE_BUCKETS)[number] {
  if (n <= 0) return '0'
  if (n < 5) return '1-4'
  if (n < 10) return '5-9'
  if (n < 15) return '10-14'
  if (n < 25) return '15-24'
  return '25+'
}

export function minutesBucket(m: number): (typeof MINUTE_BUCKETS)[number] {
  if (m < 5) return '0-4'
  if (m < 10) return '5-9'
  if (m < 15) return '10-14'
  if (m < 30) return '15-29'
  return '30+'
}

export function daysBucket(days: number): (typeof DAY_BUCKETS)[number] {
  if (days <= 7) return '0-7'
  if (days <= 14) return '8-14'
  if (days <= 28) return '15-28'
  return '29+'
}

export function lengthBucket(seconds: number): (typeof LENGTH_BUCKETS)[number] {
  if (seconds < 60) return 'under-1-min'
  if (seconds < 300) return '1-4-min'
  if (seconds < 600) return '5-9-min'
  return '10-min-plus'
}
