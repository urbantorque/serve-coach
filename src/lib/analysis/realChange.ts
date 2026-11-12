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
 * the virtual phone from the guide's placement and from behind — each serve
 * filmed 240 times with the suite's camera noise, on 30 and 60 fps files, read
 * the way the app reads a file and scored through the app's own path (H39). The rule for each
 * figure is the same: take the 90th percentile of how far the statistic moved
 * between takes of ONE serve, keep the largest over every serve and both files,
 * and call a change real only past it. So no serve in the ensembles shows a
 * noise-only change as real more than one time in ten.
 *
 * It used to be 24 and 60 takes of films at 30 and 50 fps, one sampling phase
 * each, with no levelling and no confidence. Most floors fell, and not mostly for
 * the read: 240 takes rather than 24 or 60 took rhythm from 34 to 31, the toss
 * read in seconds (H36) took the toss from 7 to 5, and walking the frames took a
 * point off the swing and contact. The old films on today's engine land within a
 * point of these.
 *
 * STILL ONE DRAW. A fresh set of 240 takes breaks about 11 of the 58 figures,
 * nearly all by landing exactly on the floor, which is what a fresh table against
 * a fresh draw of the same size does too. So a figure is good to about a point,
 * and a change of ensemble can still redden the suite with no change of engine.
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
 * The spread across the areas is the measurement, not a choice. Rhythm is a
 * single row, and one row moves its area by everything it moves.
 *
 * Loading was 17 while the trunk turn was one of its rows, the noisiest
 * reading in the engine. It is a reading now, and loading re-derived at 10
 * (9 at 24 takes, 8 at 60). The trip rose from 10 to 11 with it: the overall
 * leans harder on each of loading's three rows than it did on four.
 *
 * Contact was 21 while arm extension was the straightest single sample. Read
 * off curves through the samples it re-derived at 14 (11 at 24 takes, 13 at 60).
 *
 * When load ratio stopped taking its moment from the knees, the overall fell
 * from 6 to 5 (4 at both), the trip from 11 to 8 (7 at both) and rhythm from 36
 * to 34 (31 at 24 takes, 33 at 60).
 *
 * On the app's read (H39) the toss fell from 7 to 5, loading from 10 to 9, the
 * swing from 6 to 5, contact from 14 to 13 and rhythm from 34 to 31. Loading moves
 * 8 at its 90th percentile with or without the serves from behind, so 9 either way.
 * What the back fence does raise is two rows: shoulder tilt's floors are 19, 15
 * and 12 with it against 16, 11 and 9 without, and contact height's two a side 3
 * against 2 (H45).
 */
export const REAL_CHANGE: Record<ChangeScope, number> = {
  overall: 5,
  toss: 5,
  loading: 9,
  swing: 5,
  contact: 13,
  rhythm: 31,
  trip: 8,
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
 * lost the trunk turn, for the trip's reason, and to 16 when arm extension moved
 * to curves (the wobbly toss, 14 to 15 at 24 takes). It fell to 12 when load
 * ratio stopped taking its moment from the knees. A change between the two
 * floors is reported as soft: shown, and not called a change. Past this one it
 * is a change whatever the rows were. Absent for an area the ensembles never
 * read differently (the ball and the camera's side are what change its rows in
 * life, and neither is in them), so a change there read differently is soft
 * however large.
 *
 * Contact asked for one once, on the app's path, from one odd take of 240. A
 * floor needs several takes on the side read differently (H44), so a change in
 * contact read differently stays soft.
 */
export const READ_DIFFERENTLY: Partial<Record<ChangeScope, number>> = {
  overall: 13,
  swing: 43,
}

/** One basket's best-to-worst gap against another's, for `gapDeltaLine`, on six serves each. */
export const GAP_CHANGE = 12

/**
 * The smallest best-to-worst gap that is two different serves, by how many
 * serves the basket read. The highest and lowest of several takes of one serve
 * sit further apart than any two picked in advance, so the bar rises with the
 * basket. Measured on baskets whose best and worst were read alike, which
 * `buildGap` insists on.
 */
const BEST_WORST: Record<number, number> = { 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 }

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
  releaseHeight: [3, 3, 2],
  tossArmHold: [5, 4, 4],
  tossPathWobble: [10, 7, 6],
  kneeBend: [14, 10, 8],
  shoulderTilt: [19, 15, 12],
  legDrive: [5, 4, 3],
  dropDepth: [51, 33, 23],
  elbowAtDrop: [23, 16, 13],
  dropToContact: [40, 27, 22],
  handUnderElbow: [6, 6, 5],
  contactHeight: [4, 4, 3],
  armExtension: [26, 18, 15],
  contactAhead: [16, 12, 10],
  loadRatio: [31, 22, 18],
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
/** Which rows a report graded, in a scope: two reports read alike when these match. */
export function readAlikeKey(fs: Graded[], scope: 'overall' | FundamentalId = 'overall'): string {
  return fs
    .filter(isMeasured)
    .filter((f) => scope === 'overall' || f.id === scope)
    .map((f) => `${f.id}:${rowsOf(f)}`)
    .sort()
    .join('|')
}

export function readAlike(a: Graded[], b: Graded[], scope: 'overall' | FundamentalId = 'overall'): boolean {
  return readAlikeKey(a, scope) === readAlikeKey(b, scope)
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
