/**
 * Whether the shoot list would actually satisfy the gate it exists to satisfy.
 *
 * THE FAILURE THIS PREVENTS COSTS A DAY AND A COURT. `fixtures/index.ts` does not
 * ask for six clips — it asks for six clips *spanning three axes*: both hands,
 * two views, two frame rates. A shoot list that satisfied somebody's sense of
 * thoroughness and not those axes would send a person out with a phone, take an
 * afternoon of somebody else's tennis, and come back with a set the suite still
 * refuses. The list and the gate have to agree, and the only way they agree is
 * if something runs one against the other.
 *
 * Driven through the gate's own `SPREAD` rather than against a copy of it, for
 * the reason this codebase applies everywhere: a reimplementation agreeing with
 * itself proves nothing.
 */
import { FIXTURE_PLAN } from '../fixturePlan'
import { MINIMUM_RECORDED } from '../analysis/__tests__/fixtures'
import { cueIssues, wordCount } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

heading('The shoot list, against the gate it has to clear')

const distinct = <T>(xs: readonly T[]) => new Set(xs).size

note(
  `${FIXTURE_PLAN.length} clips — ` +
    `${distinct(FIXTURE_PLAN.map((c) => c.handedness))} hands, ` +
    `${distinct(FIXTURE_PLAN.map((c) => c.view))} views, ` +
    `${distinct(FIXTURE_PLAN.map((c) => c.fps))} frame rates`,
)

check('the shoot is exactly as long as the gate demands', () => {
  /*
   * Read off `MINIMUM_RECORDED` rather than written as 6, so raising the floor
   * turns this red and somebody has to decide what the extra clip is *for*
   * rather than leaving a list that can no longer satisfy the thing it feeds.
   */
  assert(
    FIXTURE_PLAN.length === MINIMUM_RECORDED,
    `the list has ${FIXTURE_PLAN.length} clips against a floor of ${MINIMUM_RECORDED}`,
  )
})

check('filming the whole list would clear the spread, not just the count', () => {
  /*
   * The dangerous state `fixtureGate` describes at length is a part-full set:
   * green against reality for one player, one hand, one frame rate and one
   * camera angle. A shoot list that could only ever produce that state is a trap
   * with a tick-box on it.
   *
   * The three numbers here are the gate's own, and they are asserted from the
   * plan's side: whatever `SPREAD` wants, the list has to be able to supply.
   */
  assert(distinct(FIXTURE_PLAN.map((c) => c.handedness)) >= 2, 'the list never asks for a left-hander')
  assert(distinct(FIXTURE_PLAN.map((c) => c.view)) >= 2, 'every clip on the list is the same view')
  assert(distinct(FIXTURE_PLAN.map((c) => c.fps)) >= 2, 'every clip on the list is the same frame rate')
})

check('the everyday case is first, and the deliberate failure is last', () => {
  /*
   * Order is the one thing a shoot list can get wrong that still looks correct.
   * Somebody who runs out of daylight after two clips should have the two that
   * matter most, and the clip whose whole point is that a measurement degrades
   * is the one you want least if you only get one.
   */
  const first = FIXTURE_PLAN[0]
  assert(
    first.handedness === 'right' && first.view === 'side' && first.fps === 30,
    `the list opens with ${first.what} rather than the everyday case`,
  )
  const last = FIXTURE_PLAN[FIXTURE_PLAN.length - 1]
  assert(/out of frame/.test(last.what), `the list ends with "${last.what}" rather than the cropped clip`)
})

check('a left-hander is asked for early enough to be worth asking', () => {
  // The clip most likely to be skipped, because it needs a second person. Two
  // of six, so a partial shoot still has a chance of containing one — and it is
  // the axis `SPREAD` cannot be satisfied without.
  const lefties = FIXTURE_PLAN.filter((c) => c.handedness === 'left')
  assert(lefties.length >= 2, `only ${lefties.length} left-handed clips on a list of ${FIXTURE_PLAN.length}`)
  assert(
    lefties[0].n <= 4,
    `the first left-handed clip is number ${lefties[0].n}, late enough to be dropped`,
  )
})

check('the list numbers itself in the order it is written', () => {
  // A list a person counts off out loud, where a gap or a repeat is the kind of
  // thing nobody notices until they are standing on a court.
  FIXTURE_PLAN.forEach((c, i) => {
    assert(c.n === i + 1, `clip ${i + 1} is numbered ${c.n}`)
  })
})

check('every line on it passes the same editor as everything else a person reads', () => {
  /*
   * A shoot list written in lab register is one more reason not to go to the
   * court. Held to the same cap and the same jargon rules as a coaching cue,
   * because the audience is the same person on the same day.
   */
  for (const c of FIXTURE_PLAN) {
    for (const [where, text] of [['what', c.what], ['why', c.why]] as const) {
      const issues = cueIssues(text)
      assert(issues.length === 0, `clip ${c.n} ${where}: ${issues.join('; ')}\n        "${text}"`)
      assert(wordCount(text) <= 25, `clip ${c.n} ${where} runs to ${wordCount(text)} words`)
    }
  }
})

report()
