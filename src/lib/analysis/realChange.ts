/**
 * What counts as a real change in a score (L3.1).
 *
 * A score is read off a camera, and the camera moves it on its own: film the
 * identical serve twice and the two reports disagree by a few points overall
 * and by a great deal more on some areas. The app used to call anything under
 * three points noise, everywhere. On club serves that line was measured on
 * nothing — the only noise test ran on the clean rig serve — and the review
 * found single-serve deltas past it on four screens that were the camera
 * talking (`LEVEL-UP-REVIEW.md`, finding 2).
 *
 * Every number here is measured, in `realChange.test.ts`, which re-derives the
 * table and fails if the camera now moves a score further than it says. The
 * ensembles: the modal club serve (rigid legs, no drop), a family of club
 * faults dialled into the rig one at a time, and the six Bath serves filmed by
 * the virtual phone from the guide's placement — each serve filmed 24 and 60
 * times with the suite's camera noise, at 30 and 50 fps. The rule for each
 * figure is the same: take the 90th percentile of how far the statistic moved
 * between takes of ONE serve, keep the largest over every serve and both frame
 * rates, and call a change real only past it. So no serve in the ensembles
 * shows a noise-only change as real more than one time in ten.
 *
 * Per serve and not pooled, because a player has one serve. Pooling the family
 * would let the steady members cover for a wobbly toss's own noise.
 *
 * WHAT THIS DOES NOT COVER. The ensembles have no ball, so the ball rows'
 * noise is not in here, and the rig's noise is a model of a phone, not a
 * measurement of one (`repeatability.ts`). It is the camera's noise only: a
 * player's own serve-to-serve spread is real and is what L3.2's trip ranges
 * are for.
 */
import { isMeasured } from './coaching'
import type { Fundamental, FundamentalId } from './types'

/**
 * What a score change is a change of. `trip` is one visit's median serve
 * against another's, three serves or more on each (L3.2).
 */
export type ChangeScope = 'overall' | 'trip' | FundamentalId

/**
 * The smallest change that is the serve rather than the camera, in points:
 * one past the 90th percentile of how far two takes of one serve, graded on
 * the same rows, moved apart. A change smaller than this is "no real change".
 *
 * The spread across the areas is the measurement, not a choice. Contact is
 * scored on readings whose bands are narrow against their noise on real motion
 * (arm extension), so the camera moves it far more than it moves the toss;
 * rhythm is a single row, and one row moves its area by everything it moves.
 *
 * Loading was 17 while the trunk turn was one of its rows, the noisiest
 * reading in the engine. It is a reading now, and loading re-derived at 10
 * (9 at 24 takes, 8 at 60). The trip rose from 10 to 11 with it: the overall
 * leans harder on each of loading's three rows than it did on four.
 */
export const REAL_CHANGE: Record<ChangeScope, number> = {
  overall: 6,
  toss: 7,
  loading: 10,
  swing: 6,
  contact: 21,
  rhythm: 36,
  trip: 11,
}

/**
 * The same, for two serves graded on different rows (`readAlike`).
 *
 * When the racket never falls and the legs stay straight, the drop and the
 * trophy land on the toss, and the rows read at those moments leave the card.
 * Whether that happens is decided at a border, and camera noise moves a serve
 * across it: on the modal club serve, three take-pairs in five land on
 * opposite sides. Two such takes are not the same measurement, and the score
 * moves further between them than between two takes graded alike.
 *
 * Measured where the ensembles produce such pairs — the overall, and the swing
 * whose rows the collapse takes. The overall's rose from 14 to 15 when loading
 * lost the trunk turn, for the trip's reason. A change between the two floors is reported
 * as soft: shown, and not called a change. Past this one it is a change
 * whatever the rows were. Absent for an area the ensembles never read
 * differently (the ball and the camera's side are what change its rows in
 * life, and neither is in them), so a change there read differently is soft
 * however large.
 */
export const READ_DIFFERENTLY: Partial<Record<ChangeScope, number>> = {
  overall: 15,
  swing: 42,
}

/** One basket's best-to-worst gap against another's, for `gapDeltaLine`, on six serves each. */
export const GAP_CHANGE = 13

/**
 * The smallest best-to-worst gap that is two different serves, by how many
 * serves the basket read. The highest and lowest of several takes of one serve
 * sit further apart than any two picked in advance, so the bar rises with the
 * basket. Measured on baskets whose best and worst were read alike, which
 * `buildGap` insists on.
 */
const BEST_WORST: Record<number, number> = { 2: 6, 3: 8, 4: 8, 5: 9, 6: 9 }

/** `BEST_WORST` for any basket size: the two ends hold the table's edges. */
export function bestWorstGap(serves: number): number {
  const sizes = Object.keys(BEST_WORST).map(Number)
  const n = Math.min(Math.max(serves, Math.min(...sizes)), Math.max(...sizes))
  return BEST_WORST[n]
}

/**
 * The smallest change in one card row's mean score that is the serve, with
 * one, two, and three or more serves on each side — for the practice card,
 * which sets a row's newer serves against its older ones.
 *
 * Over every pair of takes rather than pairs read alike, because the card
 * averages a row over many serves and cannot keep the ones that straddled the
 * collapse out. Measured at each size rather than scaled by √n: a row whose
 * scores pile up at 100 (the toss path) or that only takes a few values (leg
 * drive) shrinks far more slowly than √n says when averaged, and the √n rule
 * under-covered both. Past three a side the three-a-side floor holds, which is
 * wider than the noise there and so errs towards "not moving".
 */
export const ROW_CHANGE: Record<string, readonly [number, number, number]> = {
  releaseHeight: [4, 3, 2],
  tossArmHold: [8, 5, 5],
  tossPathWobble: [14, 12, 10],
  kneeBend: [15, 10, 8],
  shoulderTilt: [16, 12, 10],
  legDrive: [6, 4, 4],
  dropDepth: [52, 34, 23],
  elbowAtDrop: [23, 18, 9],
  dropToContact: [39, 25, 12],
  handUnderElbow: [6, 6, 4],
  contactHeight: [5, 4, 3],
  armExtension: [36, 26, 22],
  contactAhead: [17, 13, 11],
  loadRatio: [36, 28, 21],
}

/**
 * `ROW_CHANGE` for a row with `perSide` serves on each side. A row with no
 * measured noise (the ball rows) takes its area's floor, at every size.
 */
export function rowChange(id: string, area: FundamentalId, perSide: number): number {
  const floors = ROW_CHANGE[id]
  if (!floors) return REAL_CHANGE[area]
  return floors[Math.min(Math.max(1, Math.floor(perSide)), 3) - 1]
}

type Graded = Pick<Fundamental, 'id' | 'score' | 'metrics'>

/** The rows an area graded, in a form two reports can be compared on. */
const rowsOf = (f: Graded): string =>
  f.metrics
    .map((m) => m.id)
    .sort()
    .join(',')

/**
 * Whether two reports graded the same rows, so a difference in `scope` is one
 * measurement taken twice rather than two measurements.
 *
 * For an area, that area's rows. For the overall, every area's, and the same
 * areas measured: the overall is renormalised over what was measured, so a
 * Rhythm that left the card changes what the overall is an average of.
 */
export function readAlike(a: Graded[], b: Graded[], scope: 'overall' | FundamentalId = 'overall'): boolean {
  const key = (fs: Graded[]) =>
    fs
      .filter(isMeasured)
      .filter((f) => scope === 'overall' || f.id === scope)
      .map((f) => `${f.id}:${rowsOf(f)}`)
      .sort()
      .join('|')
  return key(a) === key(b)
}

/**
 * What a change in a score says: up, down, nothing the camera could not have
 * made, or soft — past the floor, but between two serves graded on different
 * rows and not past the floor for that (`READ_DIFFERENTLY`).
 */
export type Change = 'up' | 'down' | 'same' | 'soft'

export function changeOf(delta: number, scope: ChangeScope, alike = true): Change {
  if (Math.abs(delta) < REAL_CHANGE[scope]) return 'same'
  if (!alike) {
    const wider = READ_DIFFERENTLY[scope]
    if (wider === undefined || Math.abs(delta) < wider) return 'soft'
  }
  return delta > 0 ? 'up' : 'down'
}
