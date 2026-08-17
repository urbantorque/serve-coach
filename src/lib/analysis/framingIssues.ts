/**
 * Is this clip framed well enough to measure, and the thresholds that decide.
 *
 * WHY THIS IS ITS OWN FILE, WHICH IS A COST AND WAS PAID FOR A MEASUREMENT.
 * This lived in `groundTruth.ts`, and that file's own comment argued for keeping
 * it there: the app runs the same check live, and sitting beside the fixture
 * machinery is what gets it covered by whatever real footage that suite grows,
 * rather than becoming a separate heuristic nobody validates. That argument
 * still stands and nothing about it has changed — the fixture suite imports this
 * and exercises it exactly as before, because coverage follows imports and not
 * file boundaries.
 *
 * What changed is what the shared file costs. `analyze.ts` and `framing/judge.ts`
 * both need this on every clip and every preview frame, so `groundTruth.ts` was
 * always partly in the entry chunk; R59·1 then made `dev/exportFixture.ts`
 * reachable outside a dev build, and it imports the *validator* half of the same
 * module. Rollup puts a module shared between the entry and a lazy chunk into
 * the entry, so eight hundred lines of fixture schema became weight on every
 * player's first paint — 6.41 kB raw, 2.31 kB gzip, measured before and after.
 *
 * Splitting the file breaks that edge. The running app imports this; the fixture
 * tools import `groundTruth.ts`; neither pulls the other. R68 in `NEXT.md`
 * carries the numbers.
 */
import { LM } from './geometry'
import type { Frame } from './types'

/*
 * The two lines `framingIssues` draws, named and exported.
 *
 * Named because they were three inline copies of one literal and a fourth
 * doing something else entirely, and exported because the capture-time check
 * now reports these verdicts to a player while they can still move the phone —
 * so a caller wanting to say *how* cropped is too cropped had no way to ask.
 * `framing/judge.ts` still consumes the FUNCTION rather than these numbers, and
 * should: re-applying a threshold is how a second opinion about framing gets
 * born.
 *
 * WHERE THEY CAME FROM IS NOT RECORDED, and this comment will not invent it.
 * Nothing in this tree derives either figure from a measurement — no footage
 * was swept for the visibility share at which a pose stops being readable, and
 * no clip was filmed at a series of distances to find where the tracker gives
 * up. They are the thresholds this function has always used, they are validated
 * only in the sense that the fixture suite runs against them, and a number
 * moved here moves what the analyser refuses. Treat them as a convention with a
 * test around it, not as a finding.
 */

/** A landmark seen in fewer than this share of the frames counts as not seen. */
export const SEEN_FRACTION_FLOOR = 0.5

/** …where "seen" in a single frame is the tracker's own visibility above this. */
export const VISIBLE_FLOOR = 0.5

/** Nose-to-ankle span, as a share of frame height, below which the player is too far away. */
export const MIN_FRAME_HEIGHT_SHARE = 0.3

/**
 * Is this clip framed well enough to measure?
 *
 * Split out from the fixture machinery because the app runs the same check
 * live — see `preflight` in `pose/extract.ts`. Kept here so it is covered by
 * whatever real footage the fixture suite grows, rather than being a separate
 * heuristic nobody ever validates.
 */
export function framingIssues(frames: Frame[]): string[] {
  if (!frames.length) return ['nobody-visible']
  const issues: string[] = []
  const seen = (lm: number) =>
    frames.filter((f) => (f.image[lm]?.visibility ?? 0) > VISIBLE_FLOOR).length / frames.length

  const feet = Math.max(
    Math.min(seen(LM.leftAnkle), seen(LM.rightAnkle)),
    Math.min(seen(LM.leftHeel), seen(LM.rightHeel)),
  )
  if (feet < SEEN_FRACTION_FLOOR) issues.push('feet-cropped')

  const head = seen(LM.nose)
  if (head < SEEN_FRACTION_FLOOR) issues.push('head-cropped')

  const torso = Math.min(seen(LM.leftShoulder), seen(LM.rightShoulder), seen(LM.leftHip))
  if (torso < SEEN_FRACTION_FLOOR) issues.push('body-unclear')

  // The player standing so small in frame that the tracker has little to work
  // with. Measured head-to-ankle against the frame height.
  const heights = frames
    .map((f) => Math.abs((f.image[LM.leftAnkle]?.y ?? 0) - (f.image[LM.nose]?.y ?? 0)))
    .filter((h) => h > 0)
  const typical = heights.length ? heights.sort((a, b) => a - b)[heights.length >> 1] : 0
  if (typical > 0 && typical < MIN_FRAME_HEIGHT_SHARE) issues.push('too-far-away')

  /**
   * Neither hand ever found.
   *
   * Standing small in the frame costs sharpness and is survivable, because every
   * measurement is a ratio of the player's own height rather than of anything in
   * the room. Losing the hands is different in kind: the swing, the drop, the
   * toss and contact are all read off a wrist, so a clip with no wrist in it has
   * no serve in it to read however good the rest of the framing looks.
   *
   * It has to be checked separately from distance because the pose model does
   * not fail loudly. At the far end of a court a hand is a couple of pixels and
   * the model infers one, returning coordinates indistinguishable from a tracked
   * hand and a visibility near zero that nothing else here was reading.
   *
   * Taken on the better of the two wrists: one arm disappearing behind the torso
   * is ordinary, and both being invisible for most of a clip is not.
   */
  const hands = Math.max(seen(LM.leftWrist), seen(LM.rightWrist))
  if (hands < HANDS_SEEN_FLOOR) issues.push('hands-unseen')

  return issues
}

/**
 * How much of a clip at least one wrist has to be visible in.
 *
 * Deliberately low. This is not a quality bar — a hand seen a third of the time
 * makes for a soft reading, not a refused one, and softness is measured
 * elsewhere. It is the point below which the swing being measured is the pose
 * model's guesswork rather than the player's arm. A real clip filmed from the
 * far baseline came in at zero.
 */
export const HANDS_SEEN_FLOOR = 0.3
