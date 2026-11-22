/**
 * The check that closes the loop (C1.4): after a drill block, the next filmed
 * serve is read against that drill's fault first, and the report says plainly
 * whether it moved past the player's own noise.
 *
 * A DRILL BLOCK is a drill the player marked done between their last filmed
 * serve and this one (`PracticeLog.doneAt`). The drill names its fault: either
 * a step of that fault's ladder, or the card row the log was for.
 *
 * PAST THEIR OWN NOISE is `baseline.ts`'s question, asked of one row: the
 * player's usual reading of it and how far their own serves wander around that
 * usual, with the camera's noise folded in. A move inside that is not called a
 * change, however good it looks; a move past it is, and the target band says
 * whether it was the right way. Where the history is too short to know the
 * player's spread, or the fault has no card row to read it from, this says so
 * rather than reading one serve as a trend.
 */
import { FLAWS, type FlawId } from './analysis/flaws'
import { everyProgression, judgeServe } from './analysis/progressions'
import { CARD_SIGNAL } from './analysis/tiers'
import { cue } from './analysis/voice'
import { againstUsual, baselineFor, type ReadableServe } from './baseline'
import type { PracticeLog, ServeTag, Session } from './storage/db'

export type LoopOutcome = 'towards' | 'away' | 'level' | 'within' | 'no_usual' | 'no_usual_clean' | 'no_usual_named' | 'unread'

export interface LoopRead {
  flaw: FlawId
  drill: string
  outcome: LoopOutcome
  line: string
}

/** The card row a fault is judged from, or none (the tray and the trunk are read off the body, not a row). */
export function rowOf(flaw: FlawId): string | undefined {
  const signal = FLAWS.find((f) => f.flaw === flaw)?.signal
  return Object.keys(CARD_SIGNAL).find((row) => CARD_SIGNAL[row] === signal)
}

/** The fault a logged drill was for: a step of its ladder, or the row it was logged against. */
export function flawOfDrill(log: Pick<PracticeLog, 'drill' | 'metricId'>): FlawId | undefined {
  for (const [flaw, ladder] of everyProgression()) {
    if (ladder.steps.some((s) => s.name === log.drill)) return flaw
  }
  return (Object.keys(CARD_SIGNAL).includes(log.metricId) &&
    FLAWS.find((f) => f.signal === CARD_SIGNAL[log.metricId])?.flaw) || undefined
}

const LINES: Record<LoopOutcome, (drill: string) => string> = {
  towards: (d) => `After ${d}, this serve moved towards the target, past your usual spread. The drill is working.`,
  away: (d) => `After ${d}, this serve moved away from the target, past your usual spread. One serve can, so film a few more.`,
  level: (d) => `After ${d}, this serve moved past your usual spread but stayed on target. A change, not a fix.`,
  within: (d) => `After ${d}, this serve sits inside your usual spread. No change I can trust yet, so keep going.`,
  no_usual: (d) => `After ${d}, I do not know your usual spread for this yet, so this is one serve’s read.`,
  no_usual_clean: (d) => `After ${d}, this serve came back clean of it. I do not know your usual spread yet, so it is one serve.`,
  no_usual_named: (d) => `After ${d}, this serve still shows it. I do not know your usual spread yet, so it is one serve.`,
  unread: (d) => `After ${d}, I could not read this on this serve, so I cannot say if the drill moved it.`,
}

/**
 * This serve against the drill done just before it, or nothing when no drill
 * was done since the last serve.
 */
export function drillLoop(
  serve: ReadableServe & Pick<Session, 'diagnosis'>,
  history: readonly Session[],
  logs: readonly PracticeLog[] | undefined,
  tags: readonly ServeTag[] = [],
): LoopRead | undefined {
  if (!logs?.length) return undefined
  const before = history.filter((s) => s.id !== serve.id && s.createdAt < serve.createdAt)
  const since = before.reduce((t, s) => Math.max(t, s.createdAt), -Infinity)
  const log = logs
    .filter((l) => l.doneAt > since && l.doneAt <= serve.createdAt)
    .sort((a, b) => b.doneAt - a.doneAt)
    .find((l) => flawOfDrill(l) !== undefined)
  if (!log) return undefined
  const flaw = flawOfDrill(log)!
  const drill = log.drill
  const said = (outcome: LoopOutcome): LoopRead => ({ flaw, drill, outcome, line: cue(LINES[outcome](drill)) })

  const judged = judgeServe(serve, flaw)
  if (judged === 'unread') return said('unread')
  const row = rowOf(flaw)
  const baseline = row ? baselineFor(serve, before, tags) : undefined
  // No spread to read it against: one serve's own verdict, said as one serve.
  if (!row || !baseline?.rows.some((r) => r.metricId === row)) return said(judged === 'clean' ? 'no_usual_clean' : 'no_usual_named')
  const moved = againstUsual(serve, baseline).find((f) => f.metricId === row)
  if (!moved) return said('within')
  return said(moved.band === 'towards' ? 'towards' : moved.band === 'away' ? 'away' : 'level')
}
