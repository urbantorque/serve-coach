/**
 * The serve path (L3.5): each part of the serve, in the hierarchy's order, as
 * one of four states — not seen yet, working on (step k of n), holding, or
 * locked in — and a headline in words: "4 of 7 parts holding".
 *
 * Progress shown as faults retired rather than as points. A season of real
 * fixes moves the overall less than the camera does (L3.1), so a player whose
 * racket drop has been clean for a month deserves to see that said, not
 * inferred from a chart.
 *
 * SEVEN PARTS, not the six the roadmap counted: every group in the hierarchy
 * has a fault the engine names, the order the body turns in included.
 *
 * Read off `standing` (graduation.ts), so the path, the week plan and the
 * graduation lines cannot disagree about a fault. A relapse is a fault that
 * held once and does not now; the path moves its part back and says so.
 */
import { HIERARCHY } from './analysis/faultOrder'
import { lastSeverity, progressionFor, rungFor } from './analysis/progressions'
import { FLAWS, type FlawId } from './analysis/flaws'
import { PART_NAME, RECHECK_EVERY, standing, tripsAfter, type Standing } from './graduation'
import type { Session } from './storage/db'

export type PartState = 'not_seen' | 'working' | 'holding' | 'locked'

export interface PathPart {
  /** The hierarchy group: grip, toss, legs, posture, drop, sequence, contact. */
  group: string
  /** "The toss", as a line names it. */
  name: string
  state: PartState
  /** The fault being worked on, when the part is. */
  flaw?: FlawId
  /** Its ladder rung, when it has a ladder. */
  step?: { at: number; of: number }
  /** It held once and has slipped back, said plainly. */
  slipped?: string
}

export interface ServePath {
  parts: PathPart[]
  /** Parts holding, locked in included. */
  holding: number
  locked: number
  /** The path in words. */
  headline: string
}

/** The faults the engine can name. One it never names (`notNamed`) has no state to show. */
const NAMED = new Set<FlawId>(FLAWS.filter((s) => s.notNamed === undefined).map((s) => s.flaw))

/** One fault's state, from where it stands. */
function stateOf(s: Standing, sessions: readonly Session[]): PartState {
  if (s.held) return tripsAfter(sessions, s.held.since) >= RECHECK_EVERY ? 'locked' : 'holding'
  return s.namedLately > 0 ? 'working' : 'not_seen'
}

/** A part's name with a capital, for the start of a sentence. */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The path, or nothing when no part has been judged at all — a history of
 * refused clips, or none.
 */
export function servePath(
  sessions: readonly Session[],
  rungs?: Partial<Record<string, number>>,
): ServePath | undefined {
  const parts: PathPart[] = []
  let judgedAny = false
  for (const level of HIERARCHY) {
    const faults = level.flaws.filter((f) => NAMED.has(f))
    if (!faults.length) continue
    const stand = faults.map((f) => standing(sessions, f))
    if (stand.some((s) => s.judged > 0)) judgedAny = true
    const states = stand.map((s) => stateOf(s, sessions))
    const name = PART_NAME[level.group]
    const working = stand.find((_, i) => states[i] === 'working')
    let state: PartState
    if (working) state = 'working'
    else if (states.every((s) => s === 'not_seen')) state = 'not_seen'
    else if (states.filter((s) => s !== 'not_seen').every((s) => s === 'locked')) state = 'locked'
    else state = 'holding'

    const part: PathPart = { group: level.group, name, state }
    if (working) {
      part.flaw = working.flaw
      const ladder = progressionFor(working.flaw)
      if (ladder) {
        const rung = rungFor(working.flaw, ladder, rungs, lastSeverity(sessions, working.flaw))
        part.step = { at: rung + 1, of: ladder.steps.length }
      }
      if (working.heldBefore) {
        part.slipped =
          `${capital(name)} has slipped back: the fault came back on ${working.namedLately} of your last ${working.lately} serves.`
      }
    }
    parts.push(part)
  }
  if (!judgedAny) return undefined
  const holding = parts.filter((p) => p.state === 'holding' || p.state === 'locked').length
  const locked = parts.filter((p) => p.state === 'locked').length
  return {
    parts,
    holding,
    locked,
    headline:
      `${holding} of ${parts.length} parts holding` + (locked ? `, ${locked} of them locked in` : '') + '.',
  }
}

/** A part's state in words, for its row. */
export function partLabel(part: PathPart): string {
  switch (part.state) {
    case 'locked':
      return 'Locked in'
    case 'holding':
      return 'Holding'
    case 'working':
      return part.step ? `Working on, step ${part.step.at} of ${part.step.of}` : 'Working on'
    default:
      return 'Not seen yet'
  }
}
