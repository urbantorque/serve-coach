/**
 * What a camera angle cannot see, and where to film from to see it (D3.9).
 *
 * Every named fault is read from every angle the app accepts, except those
 * listed here, each of which only some angles can read. From the side, since
 * D3.6, the chest's turn is read from the shoulder line's width; from behind or
 * from a corner, from the coil. What is left is the toss's drift, which is one
 * movement on two axes. The side camera sees it front-to-back and nothing of it
 * sideways, a camera behind the baseline the reverse, and a corner neither
 * cleanly (`toss_drift_ratio` in diagnose.ts).
 *
 * The report says which of these this clip could not read, from the findings it
 * actually has rather than from the angle's name: a corner at 30° reads the
 * sideways drift and one at 45° reads neither. `angleReach.test.ts` reads every
 * named fault on the rig from the side, from behind and from a corner, and
 * fails on a fault some angle misses that is not listed here, or on a listed
 * fault the angle named for it does not wake.
 */
import type { BodyAxis } from './axes'
import type { Diagnosis } from './diagnose'
import type { FlawId } from './flaws'
import { cue } from './voice'

export type View = 'side' | 'front-back' | 'angled'

export interface AngleBound {
  flaw: FlawId
  /** The axis it is read along, where the fault has one per axis. */
  axis?: BodyAxis
  /** The view that reads it. */
  filmFrom: Exclude<View, 'angled'>
  /** What the player would be checking, as the end of "I could not see …". */
  what: string
}

export const ANGLE_BOUND: AngleBound[] = [
  { flaw: 'toss_drift', axis: 'lateral', filmFrom: 'front-back', what: 'whether your toss drifts sideways' },
  { flaw: 'toss_drift', axis: 'depth', filmFrom: 'side', what: 'whether your toss drifts forward or back' },
  // The sideways lean runs along the lens from the side by contact, where the
  // hips face the net, so from there it is a guess at depth and is hedged out
  // of naming (L1.2, `leanAlongLens` in diagnose.ts). From behind the baseline
  // it lies across the picture.
  { flaw: 'posture_collapse', filmFrom: 'front-back', what: 'whether your body folds sideways' },
]

const WHERE: Record<AngleBound['filmFrom'], string> = {
  side: 'side-on',
  'front-back': 'from behind the baseline',
}

/** The angle-bound faults this clip's diagnosis has no reading for. */
export function unseenBy(diagnosis: Pick<Diagnosis, 'flaws'>): AngleBound[] {
  return ANGLE_BOUND.filter(
    (b) => !diagnosis.flaws.some((f) => f.flaw === b.flaw && (b.axis === undefined || f.axis === b.axis)),
  )
}

/** One line per unseen fault, in the player's words: what, and where to stand. */
export function unseenLines(diagnosis: Pick<Diagnosis, 'flaws'> | undefined): string[] {
  if (!diagnosis) return []
  return unseenBy(diagnosis).map((b) => cue(`From this angle I could not see ${b.what}. Film ${WHERE[b.filmFrom]} to check it.`))
}
