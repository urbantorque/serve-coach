/**
 * How a session's findings are said (L2.8): the dashboard's sentences, apart
 * from its layout so the copy rules can be held against them in Node.
 *
 * Every line goes through `cue`, and every claim comes from `sessionStats`:
 * this file decides wording, never whether something is true.
 */
import { readoutOf } from '../analysis/anatomy'
import { METRICS } from '../analysis/coaching'
import type { FlawId } from '../analysis/flaws'
import { VERDICT_TABLES } from '../analysis/verdict'
import { cue } from '../analysis/voice'
import { MIN_JUDGED, type Drift, type FaultCount, type SessionStats } from './stats'

/** A fault's name as the report heads it. */
export const flawTitle = (flaw: FlawId): string => VERDICT_TABLES.flaws[flaw]?.title ?? flaw

/** A reading's name as the card says it, lower-cased to sit inside a sentence. */
const labelOf = (id: string) => {
  const label = METRICS[id]?.label ?? id
  return label[0].toLowerCase() + label.slice(1)
}

/** One change from start to end, in words: the card's own readouts where it has them. */
export function driftLine(d: Drift): string {
  const from = readoutOf(d.id, d.early)
  const to = readoutOf(d.id, d.late)
  const label = labelOf(d.id)
  if (from && to && from !== to) return cue(`Your ${label} went from ${from} at the start to ${to} by the end.`)
  return cue(`Your ${label} ${d.gap > 0 ? 'rose' : 'fell'} from the start of the session to the end.`)
}

/** The one line at the top: how many were read, and the thing most worth knowing. */
export function headlineOf(stats: SessionStats): string {
  if (stats.read === 0) return cue('I could not read any of these serves clearly enough to measure.')
  const count = stats.read === 1 ? 'One serve read.' : `${stats.read} serves read.`
  if (stats.drifts.length) return cue(`${count} ${driftLine(stats.drifts[0])}`)
  const top = stats.faults.find((f) => f.verdict)
  if (top) return cue(`${count} ${flawTitle(top.flaw)} on ${top.named} of them.`)
  // Under the verdict's own minimum, "most of them" is a claim about too few.
  if (stats.read < MIN_JUDGED) return cue(`${count} Too few to say what the session as a whole shows.`)
  return cue(`${count} No fault showed on most of them.`)
}

/** How often a fix showed, against the serves it could be judged on when that is fewer than were read. */
export function fixCountLine(f: FaultCount, read: number): string {
  return cue(
    f.judged < read ? `On ${f.named} of the ${f.judged} serves where I could see it.` : `On ${f.named} of ${f.judged} serves.`,
  )
}

/** This session's typical (median) score against the last one's. */
export function sinceLine(now: number, before: number): string {
  return cue(
    now === before
      ? `A typical score of ${now}, the same as last session.`
      : `A typical score of ${now}, against ${before} last session.`,
  )
}

/** A fault the last session had on most serves and this one does not. */
export const goneLine = (flaw: FlawId): string =>
  cue(`Gone from most serves since last time: ${flawTitle(flaw).toLowerCase()}.`)

/** The overheads left out, said once under the counts (L2.10). */
export const unsureLine = (n: number): string =>
  cue(
    n === 1
      ? 'One overhead reached like a serve but was hit on the move, so I left it out.'
      : `${n} overheads reached like a serve but were hit on the move, so I left them out.`,
  )

/** What the fixes say when there are none to give. */
export const noFixLine = (read: number): string =>
  cue(read < MIN_JUDGED ? 'Too few serves read to name a fault for the session.' : 'No fault showed on most of your serves.')
