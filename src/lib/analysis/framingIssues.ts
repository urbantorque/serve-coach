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
import { NotAServeError, type Frame } from './types'
import { PLACEMENT } from '../placement'

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

/**
 * Which framing problems are worth stopping for, and which are worth a caveat.
 *
 * A clip can fail in one of three ways, and the app has separate machinery for
 * each. Deciding which one a problem belongs in is the whole job here:
 *
 *   1. REFUSE — there is nothing to measure at all. A thrown error, a terminal
 *      screen, no numbers, because there are none. This tier is small on
 *      purpose: it should hold only "no player", "no pixels", "no swing".
 *   2. DISTRUST — measurable, but the numbers may be wrong enough to mislead.
 *      `triage` marks the analysis `rejected`, the report leads with the reason
 *      and offers to show the numbers anyway, and nothing is filed to history.
 *      The player is never left with a dead end.
 *   3. HEDGE — readable with caveats. The analysis runs, `metricConfidence`
 *      discounts whatever the problem touches, and anything below
 *      `SOFT_MEASUREMENT` is marked on screen and barred from the headline.
 *
 * This gate is the earliest of the three and runs before a single frame has
 * been tracked, so anything it stops for can never reach the other two. That is
 * why it now stops for almost nothing.
 *
 * It previously refused three ways, and two of them were shadowing softer
 * checks further down that were never given the chance to fire. `body-unclear`
 * is the same statistic `triage` rejects at `LIMITS.visibility`, which offers
 * the override; and a player small in frame breaks no measurement here, because
 * every one of them is a ratio of that player's own body height rather than of
 * anything in the room. Both now fall through to be hedged or distrusted on the
 * evidence rather than guessed at from six preview frames.
 *
 * Head *and* feet both outside the shot is the one that still stops: standing
 * height falls back to the torso, but the ground line is derived from the head,
 * so with neither end visible the ruler every height is measured against has no
 * fixed point. Numbers would still come out. They would be wrong in a way
 * nothing downstream could detect, which is the one failure this app refuses to
 * ship. Either end alone is survivable and always was.
 */
export function blockingFramingIssue(issues: string[]): NotAServeError | undefined {
  if (issues.includes('nobody-visible')) {
    return new NotAServeError('I found no player in that clip.', [
      'Get one person fully in the picture, in good light.',
      `Stand the phone side-on, ${PLACEMENT.distance} away, ${PLACEMENT.where}.`,
      'Fit head to feet in the shot, with room above the racket.',
    ])
  }
  if (issues.includes('feet-cropped') && issues.includes('head-cropped')) {
    return new NotAServeError('Your head and feet are both out of the picture.', [
      'Turn the phone upright and step back until head and feet both fit.',
      'I measure against your own height, so I need to see your head and feet.',
    ])
  }
  // No wrist ever found, so there is no swing here to measure whatever else is
  // in shot. Almost always distance, and said that way when the framing agrees,
  // because "move closer" is something the player can act on and "I could not
  // see your hand" on its own sounds like a fault in the app.
  //
  // Worth saying plainly why this is a refusal when standing small in frame is
  // not: a clip filmed from the far baseline still produces a full set of
  // numbers, assembled from a hand the model placed by inference. They are not
  // rough, they are invented, and nothing downstream can tell the difference —
  // which is the one failure this app will not ship.
  if (issues.includes('hands-unseen')) {
    return new NotAServeError(
      issues.includes('too-far-away')
        ? 'You’re too far from the camera for me to check.'
        : 'I couldn’t see your racket hand.',
      [
        `Move the phone to ${PLACEMENT.distance} away, so you fill the picture from head to feet.`,
        'I check the swing by following your racket hand, so it must be in view.',
      ],
    )
  }
  return undefined
}
