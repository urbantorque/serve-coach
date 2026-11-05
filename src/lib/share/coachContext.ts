/**
 * What a coach would ask first, from what the phone already knows.
 *
 * One report answers "how was this serve". A coach opening it wants the rest: how
 * long this has been going on, what keeps coming back, what the player is working
 * on, how this serve sat against their own usual, and what the camera could not
 * see. Plain lines, from the same modules the player's own screens read, so the
 * two can never disagree.
 */
import { buildProgress, faultTrends, shortDate } from '../progress'
import { fastestServe } from '../speedTrend'
import { programmeFor } from '../programme'
import { selfRead } from '../selfRead'
import { aboutSpeed, defaultSpeedUnit } from '../speedCopy'
import type { ServeTag, Session } from '../storage/db'
import type { Prefs } from '../storage/prefs'
import type { ReadableServe } from '../baseline'

export interface CoachContext {
  /** How long, and which way it has gone. */
  record: string[]
  /** What keeps being named, and what the player is on. */
  working: string[]
  /** This serve against the player's own usual, past their own noise. */
  usual: string[]
}

/** The same for every report, and the first thing a coach should know. */
export const CANNOT_SEE = [
  'Where the ball landed, unless the player said so.',
  "The racket face and the spin. The racket is estimated from the hand, not tracked.",
  'Anything about pain or injury beyond the positions it reads off the body.',
  'Speed is an estimate from the video and has not been checked against a radar.',
]

const bare = (s: string) => s.replace(/\*\*/g, '')

export function coachContextOf(
  report: ReadableServe,
  sessions: readonly Session[],
  tags: readonly ServeTag[],
  prefs: Prefs,
): CoachContext {
  const record: string[] = []
  const form = buildProgress(sessions as Session[])
  if (form && form.trips.length > 1) {
    const first = form.trips[0]
    record.push(
      `${sessions.length} serves filmed over ${form.trips.length} trips since ${shortDate(first.createdAt)}. Typical score ${first.overall}, now ${form.latestTrip.overall}.`,
    )
  }
  const fastest = fastestServe(sessions as Session[])
  if (fastest) record.push(`Fastest serve ${aboutSpeed(fastest, prefs.speedUnit ?? defaultSpeedUnit())}.`)

  const working: string[] = []
  const programme = programmeFor(sessions as Session[], prefs)
  if (programme) {
    const step = programme.current.step
    working.push(`Working on: ${programme.title}${step ? `, step ${step.at} of ${step.of}` : ''}.`)
  }
  for (const f of faultTrends(sessions as Session[], prefs.ladder, form?.serveType).slice(0, 3)) {
    working.push(`${f.title}: named on ${f.named} of ${f.judged} recent serves${f.direction === 'fewer' ? ', and fading' : f.direction === 'more' ? ', and growing' : ''}.`)
  }

  const read = selfRead(report, sessions, tags)
  return { record, working, usual: [...(read?.usual ?? []), ...(read?.best ?? [])].map((f) => bare(f.line)) }
}
