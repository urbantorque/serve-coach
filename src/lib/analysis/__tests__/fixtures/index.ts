/**
 * Every ground-truth fixture the suite runs.
 *
 * Listed explicitly rather than discovered from the folder: the tests are
 * bundled by esbuild and run in Node with no filesystem access, and an explicit
 * list means adding a fixture is a reviewable one-line diff rather than
 * something that silently changes what CI checks.
 *
 * See README.md for how to capture and label one.
 */
import type { Fixture } from '../../groundTruth'

/**
 * Recorded clips. Empty until real footage is labelled — see README.md.
 *
 * Import each as JSON and add it here:
 *
 *   import sideOn30fps from './adult-side-30fps.fixture.json'
 *   export const RECORDED = [sideOn30fps as Fixture]
 */
export const RECORDED: Fixture[] = []

/**
 * The engine's accuracy claims rest entirely on RECORDED being non-empty. This
 * is the number the suite prints and warns about, kept here so there is exactly
 * one definition of "enough" and it is visible next to the empty list.
 *
 * Six is not a target so much as a floor: below it there is no chance of
 * covering both hands, more than one frame rate and more than one camera angle,
 * so a pass says nothing about footage unlike whatever happens to be here.
 */
export const MINIMUM_RECORDED = 6

/**
 * The three axes the gate can actually read off a fixture file.
 *
 * README.md's coverage table names six axes. Three of them — player build,
 * framing, lighting — live only in the `label` prose, and a gate that tried to
 * parse them would either wave through anything or reject a clip for its
 * wording. These three are structured fields (`expect.handedness`,
 * `expect.view`, `fps`), so they can be counted rather than believed, and they
 * are exactly the three the fail message below has always named: "one player,
 * one hand, one frame rate and one camera angle".
 *
 * Both hands, because a left-hander is not a mirrored right-hander to a pose
 * model — the racket arm is the one the torso occludes on a side-on clip, and
 * which arm that is decides which measurements survive. Two views and two frame
 * rates rather than three of each: the minimum is six clips, and demanding the
 * full table of a six-clip set would make the gate unsatisfiable by the set it
 * gates. Below these numbers the suite is green against one way of filming.
 */
const SPREAD = {
  /** Distinct `expect.handedness` values wanted: both of them. */
  hands: 2,
  /** Distinct `expect.view` values wanted. */
  views: 2,
  /** Distinct frame rates wanted, rounded to whole fps. */
  frameRates: 2,
} as const

/* --------------------------------------------------------------- the gate */

export interface FixtureGate {
  /** `warn` prints and passes; `fail` must take the suite red. */
  level: 'ok' | 'warn' | 'fail'
  lines: string[]
  /** Fixtures that actually count towards the minimum. */
  counted: number
}

/**
 * How loudly the suite complains about how much real footage it has.
 *
 * The three states are not a severity ramp, they are three different claims:
 *
 * - **Empty is a warning.** Nothing has been filmed yet, and the codebase says
 *   so out loud in half a dozen places — geometry.ts, tiers.ts, syntheticServe.ts
 *   and depth.test.ts all point at this list being empty when they describe what
 *   they have and have not proved. Nothing is being claimed, so nothing is being
 *   overclaimed. A red suite for footage nobody has filmed yet gets muted within
 *   a week, and a muted suite catches nothing at all.
 *
 * - **Part-full is a failure.** This is the dangerous state, and it is the
 *   reason this function exists. The moment one real clip lands, every one of
 *   those "unvalidated against real footage" caveats becomes false, and what
 *   replaces it is worse than the caveat: a suite that is green against reality,
 *   for one player, one hand, one frame rate and one camera angle. That is an
 *   accuracy claim the fixtures do not support, and unlike the empty case there
 *   is nothing left in the repo saying so. It stays red until the spread in
 *   README.md exists — the failure is the honest report of a half-built
 *   validation set, not a bug to be worked around.
 *
 * - **Full is quiet** — but only once the count *and* the spread are there.
 *   This used to gate on `recorded.length` alone while the comment and the
 *   README table both promised a spread check, so six clips of one player, one
 *   hand, one frame rate and one camera angle returned `ok` with no lines: the
 *   exact state the paragraph above calls the dangerous one, reached by the
 *   easiest route to six clips there is. See `SPREAD` for which axes can be
 *   checked and which three are prose the gate deliberately does not parse.
 *
 * A recorded *serve* that leaves `expect.handedness` or `expect.view` off is
 * named rather than ignored. Unlabelled, it cannot be counted towards a spread,
 * and the difference between "we have no left-handed footage" and "nobody wrote
 * down which hand" is the difference this gate exists to keep visible. A
 * refusal clip is exempt and `spreadGaps` says why.
 *
 * Only `source: 'recorded'` fixtures count. A synthetic one in this list would
 * move the tally without adding a single frame of reality, which is precisely
 * the overclaim the tally is here to prevent.
 */
export function fixtureGate(
  fixtures: readonly Fixture[] = RECORDED,
  minimum = MINIMUM_RECORDED,
): FixtureGate {
  const lines: string[] = []
  const recorded = fixtures.filter((f) => f.source === 'recorded')
  const synthetic = fixtures.filter((f) => f.source !== 'recorded')

  for (const f of synthetic) {
    lines.push(`${f.id} is source "${f.source}" — RECORDED counts real footage only`)
  }

  // Two fixtures under one id is a copy-paste of an import line. The suite runs
  // both, names both checks the same, and the coverage tally counts two clips
  // where there is one.
  const seen = new Set<string>()
  for (const f of fixtures) {
    if (seen.has(f.id)) lines.push(`duplicate fixture id "${f.id}"`)
    seen.add(f.id)
  }

  if (lines.length) return { level: 'fail', lines, counted: recorded.length }

  if (recorded.length === 0) {
    return {
      level: 'warn',
      counted: 0,
      lines: [
        `0 of ${minimum} recorded fixtures — every engine check is synthetic.`,
        'Hip–shoulder separation and shoulder tilt are computed from world-space z,',
        'which the rig models as exact and MediaPipe does not: they are unvalidated',
        'against any real footage. See __tests__/fixtures/README.md.',
      ],
    }
  }

  if (recorded.length < minimum) {
    return {
      level: 'fail',
      counted: recorded.length,
      lines: [
        `${recorded.length} of ${minimum} recorded fixtures.`,
        'Partial coverage is worse than none: the suite now passes against real',
        'footage, which reads as validated, on too few clips to cover both hands,',
        'more than one frame rate or more than one camera angle.',
        'Film the rest of the spread in __tests__/fixtures/README.md.',
      ],
    }
  }

  const thin = spreadGaps(recorded)
  if (thin.length) {
    return {
      level: 'fail',
      counted: recorded.length,
      lines: [
        `${recorded.length} recorded fixtures, but they are all the same kind of clip.`,
        ...thin,
        'Film across the axes in __tests__/fixtures/README.md.',
      ],
    }
  }

  return { level: 'ok', counted: recorded.length, lines: [] }
}

/**
 * Which of the three countable axes the recorded set does not cover.
 *
 * Returns one line per gap and an empty array when the set is broad enough.
 * Deliberately not a score: "you have 2 of the 3 axes" invites somebody to
 * decide 2 is enough, whereas a named missing axis reads as a shooting list.
 */
function spreadGaps(recorded: readonly Fixture[]): string[] {
  const gaps: string[] = []

  /*
   * Refusal clips are counted, and are not part of the spread.
   *
   * A `rejected: true` fixture asserts that the engine turns a rally, a practice
   * swing or somebody standing still away. It has no handedness and no view by
   * construction — `buildRejectedDraft` writes `expect: { rejected: true }` and
   * nothing else, `validateFixture` returns before it would compare either, and
   * "which hand held the racket" is not a question a clip of somebody standing
   * still has an answer to.
   *
   * Read as part of the spread it was therefore named as unlabelled every time
   * the gate ran, permanently, for a field it is not meant to carry — and the
   * fixtures README now sends people out to film exactly these clips. They still
   * count towards MINIMUM_RECORDED, because they are real footage proving a real
   * behaviour and refusing a genuine serve is a complaint this project has
   * already had. They just do not tell anyone which camera angles were covered.
   */
  const serves = recorded.filter((f) => f.expect.rejected !== true)
  if (serves.length === 0) {
    // Every distinct count below would be zero and would report three gaps
    // about missing hands and views, which reads as a labelling problem rather
    // than as what it is.
    return [
      `all ${recorded.length} recorded clips are refusals — the spread is counted over serves, ` +
        'and there are none',
    ]
  }

  const unlabelled = serves.filter((f) => !f.expect.handedness || !f.expect.view)
  if (unlabelled.length) {
    gaps.push(
      `${unlabelled.map((f) => f.id).join(', ')}: no handedness or view labelled — ` +
        'the spread cannot be counted without them',
    )
  }

  const distinct = <T>(pick: (f: Fixture) => T | undefined) =>
    new Set(serves.map(pick).filter((v): v is T => v !== undefined)).size

  const hands = distinct((f) => f.expect.handedness)
  if (hands < SPREAD.hands) {
    gaps.push(`only ${hands} handedness — a left-hander is not a mirrored right-hander to a pose model`)
  }

  const views = distinct((f) => f.expect.view)
  if (views < SPREAD.views) {
    gaps.push(`only ${views} camera view — every depth measurement is an angle away from untested`)
  }

  const rates = distinct((f) => Math.round(f.fps))
  if (rates < SPREAD.frameRates) {
    gaps.push(`only ${rates} frame rate — every timing measurement is a sampling rate away from untested`)
  }

  return gaps
}
