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
 * its frames are let go before the next one is read (`line.ts`). Resident
 * memory does not grow with the number of serves, and the whole session is one
 * row.
 *
 * Types and plain functions only, with no runtime imports: the store reads
 * this module (`db.ts`), and the store is in the bundle every cold open parses.
 *
 * One row that is rewritten as the reading goes, which is what makes it a
 * checkpoint. A phone that locks, a call, the page killed in the background:
 * the next time the same file is picked, the reading carries on from the serve
 * it had reached (`toRead`).
 */
import type { FlawId } from '../analysis/flaws'
import type { TossPlacement } from '../analysis/tossPlacement'
import type { ServeType } from '../storage/prefs'

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
  /**
   * The player's size, footing and place across the picture, for telling the
   * sides apart and noticing the phone move (`stats.ts`).
   */
  scale?: { bodyHeight: number; groundY: number; x?: number }
  /** How far past its floor each named fault was, in floors (`line.ts`). */
  past?: Partial<Record<FlawId, number>>
}

export type SessionPhase = 'locating' | 'reading' | 'done' | 'stopped'

/**
 * Where a practice session is, as its screen draws it (L2.4).
 *
 * `phase` says where the reading got to and survives a reload. This says what
 * the screen is doing about it right now: pricing the file before anything
 * starts, reading, paused and why, or finished. It lives in the view, not in
 * the row, because none of it means anything once the page is gone.
 */
export type SessionStage =
  /** Before reading: the file is being timed, then the choices are priced. */
  | { state: 'planning'; timed: boolean; perSampleMs?: number }
  | { state: 'running'; ratio: number; detail?: string; stopping?: boolean }
  /** Stopped with its place kept: by the player, by the app being hidden, or by heat. */
  | { state: 'paused'; reason: 'player' | 'hidden' | 'warm'; perSampleMs?: number }
  | { state: 'done' }

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
  /**
   * Overheads that reached like a serve and were not hit like one, seconds:
   * a smash on the move, a swing with no toss (L2.10). Left out, and counted.
   */
  unsure?: number[]
  lines: ServeLine[]
  phase: SessionPhase
  /**
   * The rubric the lines were scored on (`SCORING_VERSION`), so a session is
   * only ever set against another scored the same way (L2.8).
   */
  scoringVersion?: number
  /**
   * A still of the contact moment for the best and worst serves, by line
   * number: JPEG data URLs, the only pictures a session keeps (L2.8).
   */
  stills?: Record<number, string>
  /**
   * The best and worst serves as stretches of the file, in seconds (L2.11),
   * replayed from the same video when it is picked again.
   */
  highlights?: { number: number; kind: 'best' | 'worst'; from: number; to: number }[]
}

/** The id a session for this file is stored under. */
export const sessionIdFor = (fileKey: string): string => `practice-${fileKey}`

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
    ...(numbers(s.unsure)?.length ? { unsure: numbers(s.unsure) } : {}),
    lines,
    phase,
    ...(typeof s.scoringVersion === 'number' ? { scoringVersion: s.scoringVersion } : {}),
    ...(stillsOf(s.stills) ? { stills: stillsOf(s.stills) } : {}),
    ...(highlightsIn(s.highlights) ? { highlights: highlightsIn(s.highlights) } : {}),
  }
}

/** A place in the video as a player scrubs to it: "3:24", "1:02:05". */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Stored stills, keeping only entries that are a line number and a JPEG or PNG. */
function stillsOf(raw: unknown): Record<number, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<number, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (/^\d+$/.test(k) && typeof v === 'string' && /^data:image\/(jpeg|png);/.test(v)) out[Number(k)] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** Stored highlights, keeping only stretches with a serve, a kind and a forward range. */
function highlightsIn(raw: unknown): PracticeSession['highlights'] {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter(
    (h): h is NonNullable<PracticeSession['highlights']>[number] =>
      !!h &&
      typeof h === 'object' &&
      Number.isInteger(h.number) &&
      (h.kind === 'best' || h.kind === 'worst') &&
      Number.isFinite(h.from) &&
      Number.isFinite(h.to) &&
      h.to > h.from,
  )
  return out.length ? out : undefined
}
