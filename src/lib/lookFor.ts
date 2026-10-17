/**
 * What to look for at each of the six moments, and whether this serve showed
 * it (L4.6).
 *
 * A moment's mark is the readouts measured at it, and nothing else: a tick
 * when every one the app stands behind sits inside its band, a cross when any
 * falls outside, and no mark at all where the moment carries no confident
 * reading. The same band the card prints is the only judge, so a tick can
 * never disagree with the row it came from.
 */
import { SOFT_MEASUREMENT } from './analysis/confidence'
import { faultForMetric } from './analysis/progressions'
import type { FlawId } from './analysis/flaws'
import type { Fundamental, Metric, PhaseId } from './analysis/types'

/** What a good serve shows at each moment, said as something to check. */
export const LOOK_FOR: Record<PhaseId, string> = {
  ready: 'Feet set side-on, weight balanced, both hands together.',
  toss: 'Tossing arm straight up, the ball leaving your fingers above your head.',
  trophy: 'Knees bent, racket up behind you, tossing arm still reaching up.',
  drop: 'Racket head falling behind your back, elbow up.',
  contact: 'Arm at full stretch, the ball met at your highest point.',
  finish: 'Racket swinging across your body, landing inside the court.',
}

export interface MomentCheck {
  id: string
  label: string
  /** What the body did, in the card's own words. */
  readout: string
  /** Inside the band the card prints as the target. */
  inBand: boolean
}

const inBand = (m: Metric) => m.value >= m.ideal[0] && m.value <= m.ideal[1]
const trusted = (m: Metric) => !(m.confidence < SOFT_MEASUREMENT)

/** Every confident reading measured at one moment. */
function readingsAt(fundamentals: readonly Fundamental[], phase: PhaseId): Metric[] {
  return fundamentals.flatMap((f) => f.metrics).filter((m) => m.phase === phase && trusted(m))
}

/**
 * The readouts to set beside a moment, at most `max`: the ones off target
 * first, since those are what the picture is for, then by weight.
 */
export function momentChecks(fundamentals: readonly Fundamental[], phase: PhaseId, max = 3): MomentCheck[] {
  return readingsAt(fundamentals, phase)
    .map((m) => ({ m, in: inBand(m) }))
    .sort((a, b) => Number(a.in) - Number(b.in) || b.m.weight - a.m.weight)
    .slice(0, max)
    .map(({ m, in: ok }) => ({ id: m.id, label: m.label, readout: m.readout, inBand: ok }))
}

export type MomentMark = 'tick' | 'cross'

/** A tick when every confident reading at the moment is in its band, a cross when any is not. */
export function momentMark(fundamentals: readonly Fundamental[], phase: PhaseId): MomentMark | undefined {
  const readings = readingsAt(fundamentals, phase)
  if (!readings.length) return undefined
  return readings.every(inBand) ? 'tick' : 'cross'
}

/**
 * The moment a fault shows at: where the card row that reads its number was
 * measured. Undefined for a fault no row on this report reads.
 */
export function faultMoment(fundamentals: readonly Fundamental[], flaw: FlawId | undefined): PhaseId | undefined {
  if (!flaw) return undefined
  return fundamentals.flatMap((f) => f.metrics).find((m) => faultForMetric(m.id) === flaw)?.phase
}
