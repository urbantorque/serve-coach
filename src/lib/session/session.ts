/**
 * A practice session as it is stored: the serves the scan found, the ones
 * chosen to read, and one small line per serve read (L2.5).
 *
 * A basket keeps one whole `Analysis` per serve in memory and files one report.
 * A session cannot: fifty serves of frames is past the phone's memory, and fifty
 * reports would push the rest of the player's history out of the sixty the
 * store keeps. So each serve is read, boiled down to a `ServeLine` of about a
 * kilobyte (1.2 kB on the rig) — the graded readings with their confidence, the
 * faults named and the ones that could be judged, where the player stood — and
 * its frames are let go before the next one is read. Resident memory does not grow with the
 * number of serves, and the whole session is one row.
 *
 * One row that is rewritten as the reading goes, which is what makes it a
 * checkpoint. A phone that locks, a call, the page killed in the background:
 * the next time the same file is picked, the reading carries on from the serve
 * it had reached (`toRead`).
 */
import type { FlawId } from '../analysis/flaws'
import type { TossPlacement } from '../analysis/tossPlacement'
import type { Analysis } from '../analysis/types'
import type { ServeType } from '../storage/prefs'
import { MIN_EVIDENCE } from '../analysis/flaws'

/** One graded card reading, as a session keeps it. */
export interface LineReading {
  value: number
  confidence: number
  score: number
}

/** One serve of a session, boiled down. */
export interface ServeLine {
  /** One-based, in the clip. */
  number: number
  /** Where in the file the scan found it, seconds. */
  t: number
  /** Read to a verdict, or too unclear to measure (refused, or no serve found there). */
  status: 'read' | 'unclear'
  /** The overall score, when read. */
  overall?: number
  /** Every graded card reading that was taken, by id. */
  readings?: Record<string, LineReading>
  /** Faults named on this serve. */
  named?: FlawId[]
  /** Faults that could be judged on it at all, named or not. */
  judged?: FlawId[]
  /** Where the toss peaked against the front foot. */
  toss?: Pick<TossPlacement, 'ahead' | 'across' | 'confidence'>
  /** The player's size and footing in the picture, for telling the sides apart. */
  scale?: { bodyHeight: number; groundY: number }
}

export type SessionPhase = 'locating' | 'reading' | 'done' | 'stopped'

export interface PracticeSession {
  /** `practice-` and the file's identity, so the same file picked again finds it. */
  id: string
  createdAt: number
  updatedAt: number
  fileName: string
  /** Seconds of video. */
  duration: number
  serveType: ServeType
  handedness: 'right' | 'left'
  /** A sample of the serves, or every one. */
  mode: 'sample' | 'every'
  /** Where every serve the scan found is, seconds. Absent until the scan has run. */
  found?: number[]
  /** Which of them to read, as zero-based indexes into `found`. */
  chosen?: number[]
  lines: ServeLine[]
  phase: SessionPhase
}

/** The id a session for this file is stored under. */
export const sessionIdFor = (fileKey: string): string => `practice-${fileKey}`

/**
 * One serve's analysis, boiled down to what a session keeps.
 *
 * Only the graded rows: an ungraded reading has no band to be read against
 * across a session either. A finding counts as judged at `MIN_EVIDENCE`, the bar
 * `checkDrill` already uses, so "named on 9 of 31 serves it could be judged on"
 * means the same thing here as on a basket.
 */
export function lineOf(analysis: Analysis, number: number, t: number): ServeLine {
  if (analysis.triage?.status === 'rejected') return { number, t, status: 'unclear' }
  const readings: Record<string, LineReading> = {}
  for (const m of analysis.fundamentals.flatMap((f) => f.metrics)) {
    readings[m.id] = { value: round(m.value), confidence: round(m.confidence ?? 1), score: m.score }
  }
  const findings = analysis.diagnosis?.flaws ?? []
  const placement = analysis.diagnosis?.tossPlacement
  return {
    number,
    t,
    status: 'read',
    overall: analysis.overall,
    readings,
    named: findings.filter((f) => f.detected).map((f) => f.flaw),
    judged: findings.filter((f) => f.confidence >= MIN_EVIDENCE).map((f) => f.flaw),
    ...(placement
      ? {
          toss: {
            ...(placement.ahead !== undefined ? { ahead: round(placement.ahead) } : {}),
            ...(placement.across !== undefined ? { across: round(placement.across) } : {}),
            confidence: round(placement.confidence),
          },
        }
      : {}),
    ...(analysis.scale ? { scale: { bodyHeight: round(analysis.scale.bodyHeight), groundY: round(analysis.scale.groundY) } } : {}),
  }
}

/** Four places, which is finer than any reading here is resolved to and keeps a line small. */
const round = (v: number): number => Math.round(v * 1e4) / 1e4

/**
 * The serves still to read, as indexes into `found`, in the order to read them.
 * Empty before the scan has run and when every chosen serve has a line.
 */
export function toRead(session: Pick<PracticeSession, 'found' | 'chosen' | 'lines'>): number[] {
  if (!session.found || !session.chosen) return []
  const done = new Set(session.lines.map((l) => l.number))
  return session.chosen.filter((i) => !done.has(i + 1))
}

/** A session whose reading has not finished, for "carry on" on the home screen. */
export const unfinished = (s: Pick<PracticeSession, 'phase'>): boolean => s.phase !== 'done'

/**
 * A stored session, repaired, or `undefined` for a row that cannot be one.
 *
 * Each line is kept or dropped on its own, the rule `normalise` follows for a
 * report's areas: a malformed serve costs that serve, not the session.
 */
export function normalisePracticeSession(raw: unknown): PracticeSession | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as Partial<PracticeSession>
  if (typeof s.id !== 'string' || !s.id.startsWith('practice-')) return undefined
  if (typeof s.createdAt !== 'number' || typeof s.duration !== 'number' || !Number.isFinite(s.duration)) return undefined
  const numbers = (xs: unknown) =>
    Array.isArray(xs) && xs.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (xs as number[]) : undefined
  const found = numbers(s.found)
  const chosen = found ? numbers(s.chosen)?.filter((i) => Number.isInteger(i) && i >= 0 && i < found.length) : undefined
  const lines = (Array.isArray(s.lines) ? s.lines : [])
    .filter((l): l is ServeLine => !!l && typeof l === 'object' && typeof l.number === 'number' && typeof l.t === 'number')
    .filter((l) => l.status === 'read' || l.status === 'unclear')
  const phase: SessionPhase = ['locating', 'reading', 'done', 'stopped'].includes(s.phase as string)
    ? (s.phase as SessionPhase)
    : 'stopped'
  return {
    id: s.id,
    createdAt: s.createdAt,
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : s.createdAt,
    fileName: typeof s.fileName === 'string' ? s.fileName : 'Your session',
    duration: s.duration,
    serveType: s.serveType === 'kick' || s.serveType === 'slice' ? s.serveType : 'flat',
    handedness: s.handedness === 'left' ? 'left' : 'right',
    mode: s.mode === 'every' ? 'every' : 'sample',
    ...(found ? { found } : {}),
    ...(chosen ? { chosen } : {}),
    lines,
    phase,
  }
}
