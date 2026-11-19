/**
 * The public accuracy page's figures (N6.3), read from the tables the app
 * grades with, so the page cannot say one thing while the engine does another.
 *
 * For every graded reading: how far it moves when the same serve is read
 * again (`CARD_NOISE_SD`), how far it moved on real, small, dark footage where
 * that was more (`RETEST_SD`, measured and not adopted), and how often a serve
 * held at the middle of its band keeps its grade. That last is the band rule
 * `bandNoise.test.ts` holds, worked out rather than asserted: a band half as
 * wide as 1.96 wobbles keeps 95 serves in 100.
 *
 * DOM-free and pure, so `accuracy.test.ts` walks it in Node.
 */
import { FUNDAMENTALS, METRICS, type BandSource } from './analysis/coaching'
import { CARD_NOISE_SD, RETEST_SD } from './analysis/cardNoise'
import { REAL_CHANGE } from './analysis/realChange'

/**
 * How far the headline number moves when the same serve is read again, nine
 * times in ten (N2.11). `REAL_CHANGE.overall` is one past that 90th
 * percentile, the smallest change the app calls the serve rather than the camera.
 */
export const SCORE_STEADY = REAL_CHANGE.overall - 1

/**
 * How far the headline number moved between copies of one real serve (N7.5):
 * two small, dark public clips, each re-read darker, further away, smaller and
 * a frame later (LEDGER N2.2, `docs/next/bench/retest.json`). Wider than
 * `SCORE_STEADY`, which is measured on the test serves' own ensembles, so the
 * page says both and claims neither as the camera's whole share. Those copies
 * are 320 by 240, which the retest record says overstates the noise.
 */
export const SCORE_ON_SMALL_CLIPS: readonly [number, number] = [1, 9]

export interface AccuracyRow {
  id: string
  label: string
  unit: string
  /** How far a reading moves between reads of one serve, in its own unit. */
  wobble: number
  /** The same on two small, dark public clips, where that was more. */
  onSmallClips?: number
  /** Of 100 takes of a serve held at the middle of its band, how many keep the grade. */
  keepsGrade: number
  /** What the band rests on, in the source's own words. */
  against: string
}

/** Every reading the app grades, once. */
export const gradedIds = (): string[] => [...new Set(Object.values(FUNDAMENTALS).flatMap((f) => f.metrics))]

/** The error function, to about seven places (Abramowitz and Stegun 7.1.26). */
function erf(x: number): number {
  const s = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}

/**
 * A source in the page's words (N7.4): the forty Bath serves are "lab serves"
 * and the rig is "my test serve", the names the page explains, so a reader is
 * not left to work out what Bath or a rig is. The engine keeps its own words.
 */
export const plainSource = (text: string): string =>
  text
    .replace(/\bThe forty Bath serves\b/g, 'Forty lab serves')
    .replace(/\bthe forty Bath serves\b/g, 'forty lab serves')
    .replace(/\bThe rig's\b/g, 'My test serve\'s')
    .replace(/\bthe rig's\b/g, 'my test serve\'s')
    .replace(/\bthe rig\b/g, 'my test serve')
    .replace(/\(Bath\)/g, '(the lab serves)')

const sourceText = (s: BandSource): string => plainSource('study' in s ? s.study : s.motion)

/** The graded readings with a measured wobble, in the card's order. */
export function accuracyRows(): AccuracyRow[] {
  return gradedIds()
    .filter((id) => CARD_NOISE_SD[id] !== undefined && METRICS[id])
    .map((id) => {
      const m = METRICS[id]
      const wobble = CARD_NOISE_SD[id]
      const half = (m.ideal[1] - m.ideal[0]) / 2
      const real = RETEST_SD[id]
      return {
        id,
        label: m.label,
        unit: m.unit,
        wobble,
        ...(real !== undefined && real > wobble ? { onSmallClips: real } : {}),
        // Rounded down and never above 99: the noise behind it is a floor, so the
        // page may understate how often a grade holds and never overstate it.
        keepsGrade: Math.min(99, Math.floor(100 * erf(half / (wobble * Math.SQRT2)))),
        against: sourceText(m.source),
      }
    })
}

/** Graded with nothing measured under it: the ball readings, which the bench has no ball for. */
export function unmeasuredRows(): { id: string; label: string }[] {
  return gradedIds()
    .filter((id) => CARD_NOISE_SD[id] === undefined && METRICS[id])
    .map((id) => ({ id, label: METRICS[id].label }))
}

const fix = (v: number) => (v >= 10 ? String(Math.round(v)) : v >= 1 ? v.toFixed(1) : v.toFixed(2))

/** A wobble in words a player reads: a height as a share of their own. */
export function wobbleText(unit: string, v: number): string {
  if (unit === '×') return `${fix(v * 100)}% of your height`
  if (unit === '%') return `${fix(v)} points`
  if (unit === '°') return `${fix(v)}°`
  if (unit === 'ms') return `${Math.round(v)} ms`
  if (unit === 'm') return `${fix(v * 100)} cm`
  return `${fix(v)} ${unit}`
}
