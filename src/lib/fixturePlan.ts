/**
 * The six clips the fixture shoot needs, as a list rather than as a table
 * nobody executes.
 *
 * WHY IT IS IN CODE AND NOT ONLY IN `fixtures/README.md`. Five threads in
 * `NEXT.md` are blocked on real footage, and R59·1 made saving a fixture
 * something a person can do from a phone. What it did not do is tell them *what
 * to film*. That list existed in one place — a markdown table in a test
 * directory — so the shoot was still a thing you did by reading the repo, which
 * is exactly what R59 set out to stop.
 *
 * WHAT THIS CANNOT DO, SAID FIRST. It cannot tell anybody which clips they have
 * already got. `RECORDED` is a build-time list of files committed to the repo;
 * a phone standing on a court has no idea what is in it and never will. So this
 * is a shoot list to work down, not a progress bar, and pretending otherwise
 * would be the app claiming to know something it cannot see.
 *
 * WHAT BINDS IT TO THE GATE. `fixtures/index.ts` does not check for these six
 * clips — it checks three axes: both hands, two views, two frame rates. A shoot
 * list that satisfied a person's sense of thoroughness and not those axes would
 * send somebody to a court and back with a set the suite still refuses.
 * `fixturePlan.test.ts` runs this list through the gate's own `SPREAD` and fails
 * if it would not clear it, so the two cannot drift.
 *
 * THE ORDER IS NOT ARBITRARY and is the one `fixtures/README.md` argues for:
 * the everyday case first, because if that disagrees nothing after it matters;
 * then the same serve and the same player varied one axis at a time; the
 * left-hander fourth, because a left-hander is not a mirrored right-hander to a
 * pose model and that is the clip most likely to be skipped; and the deliberate
 * failure last.
 */

/** One clip to film, and why it is on the list. */
export interface PlannedClip {
  /** Position in the shoot, one-based — what a person counts off. */
  n: number
  /** What to film, short enough to read on a phone at a court. */
  what: string
  /** What it settles. One sentence, for somebody deciding whether to bother. */
  why: string
  /* The three fields the gate can actually count. Prose axes — player build,
   * lighting, framing — are deliberately absent: `fixtures/index.ts` refuses to
   * parse them and so does this. */
  handedness: 'right' | 'left'
  view: 'side' | 'front'
  /** Whole frames per second, as the gate rounds them. */
  fps: number
}

/**
 * The shoot, in order.
 *
 * Copy here faces the same editor as everything else a person reads — see
 * `fixturePlan.test.ts`, which runs every line through `cueIssues`. A shoot list
 * written in lab register is one more reason not to go to the court.
 */
export const FIXTURE_PLAN: readonly PlannedClip[] = [
  {
    n: 1,
    what: 'A right-handed serve, filmed side-on, at 30 fps.',
    why: 'The everyday case. If this one disagrees, nothing after it matters.',
    handedness: 'right',
    view: 'side',
    fps: 30,
  },
  {
    n: 2,
    what: 'The same player, same spot, in slow motion.',
    why: 'Says whether the engine reads one serve the same way at two frame rates.',
    handedness: 'right',
    view: 'side',
    fps: 120,
  },
  {
    n: 3,
    what: 'The same player again, this time face-on or from behind.',
    why: 'Says whether the app drops the readings it cannot take, rather than guessing them.',
    handedness: 'right',
    view: 'front',
    fps: 30,
  },
  {
    n: 4,
    what: 'A left-handed serve, filmed side-on, at 30 fps.',
    why: 'A left-hander is not a right-hander mirrored. The torso hides the other arm.',
    handedness: 'left',
    view: 'side',
    fps: 30,
  },
  {
    n: 5,
    what: 'The left-hander, face-on or angled, at 60 fps.',
    why: 'The second hand from the second view, which no other clip covers.',
    handedness: 'left',
    view: 'front',
    fps: 60,
  },
  {
    n: 6,
    what: 'A right-handed serve, side-on, with the feet out of frame.',
    why: 'Heights should come back marked approximate. That is this clip passing.',
    handedness: 'right',
    view: 'side',
    fps: 30,
  },
]
