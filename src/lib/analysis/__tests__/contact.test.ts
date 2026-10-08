/**
 * The contact instant from the racket hand and the ball together (D1.4).
 *
 * The rig throws no ball, so each check builds one: a gravity-true arc in the
 * picture that falls from its apex to within a racket's reach above the hand
 * and is last seen at the impact the check dials. Three things are dialled
 * against it, as the roadmap asked — the ball arriving after the hand's peak
 * (the lag every real serve has), a hand tracked as still rising after the hit,
 * and a hand the tracker lost before it reached the top.
 */
import { detectWithContact, readContact, CONTACT_LAG_MAX } from '../contact'
import { metricConfidence, softnessReason, type ConfidenceContext } from '../confidence'
import { detectServe, type Skeleton } from '../phases'
import { measure } from '../metrics'
import { buildServe } from '../syntheticServe'
import type { Frame } from '../types'
import { assert, check, heading, near, note, report, within } from './harness'
import { tossedBall } from './tossedBall'

const WRIST = 16 // the rig serves right-handed

/**
 * The rig's serve with the racket hand misplaced after the hit: from 80 ms
 * after contact, for `by` seconds, the tracker puts it above where it peaked
 * and still climbing — the blurred hand of a fast follow-through.
 */
function wristLate(fps: number, by: number): { frames: Frame[]; truth: Skeleton } {
  const frames = buildServe({}, fps)
  const truth = detectServe(frames, fps)
  const top = frames[truth.keys.contact].image[WRIST]
  const out = frames.map((f) => {
    const dt = f.t - truth.times.contact
    if (dt <= 0.08 || dt > 0.08 + by) return f
    const y = top.y - (0.03 + (0.03 * (dt - 0.08)) / by) * truth.bodyHeight
    return { ...f, image: f.image.map((p, k) => (k === WRIST ? { ...p, x: top.x, y } : p)) }
  })
  return { frames: out, truth }
}

heading('The racket hand and the ball, on a well-read serve')

check('the ball arriving after the hand is the lag of a real serve, not a disagreement', () => {
  for (const fps of [30, 60]) {
    const frames = buildServe({}, fps)
    const skel = detectServe(frames, fps)
    for (const lag of [0, 0.02, 0.04]) {
      const read = readContact(frames, skel, tossedBall(frames, skel, skel.times.contact + lag))
      note(`${fps} fps, ball ${lag * 1000} ms after the hand: ${read.from}, spread ${read.spreadMs} ms, agreement ${read.agreement}`)
      assert(read.from === 'wrist', `${fps} fps, lag ${lag}: the ball took over a well-read hand`)
      assert(read.agreement === 1, `${fps} fps, lag ${lag}: an ordinary lag hedged the contact readings`)
      within(read.spreadMs!, -1000 / fps, CONTACT_LAG_MAX * 1000, 'ball minus hand (ms)')
    }
  }
})

check('without a ball, or with one lost before it came down, the hand decides alone', () => {
  const frames = buildServe({}, 30)
  const skel = detectServe(frames, 30)
  const none = readContact(frames, skel)
  assert(none.from === 'wrist' && none.agreement === 1 && none.ball === undefined, 'no ball still produced a ball reading')
  // Last seen a third of a second before the hit, still high above the hand.
  const lost = readContact(frames, skel, tossedBall(frames, skel, skel.times.contact, skel.times.contact - 0.3))
  assert(lost.ball === undefined && lost.agreement === 1, `a ball lost out of reach spoke: ${JSON.stringify(lost)}`)
  // A ball nobody trusts says nothing either.
  const faint = readContact(frames, skel, { ...tossedBall(frames, skel, skel.times.contact), confidence: 0.3 })
  assert(faint.ball === undefined, 'a ball under the tracker floor was asked')
})

heading('A hand tracked after the hit')

check('a hand peak after the ball had left its arc is overruled, and contact goes back to the hit', () => {
  for (const fps of [30, 60]) {
    const { frames, truth } = wristLate(fps, 0.12)
    const late = detectServe(frames, fps)
    const ball = tossedBall(frames, truth, truth.times.contact + 0.02)
    const { skel, contact } = detectWithContact(frames, fps, undefined, ball)
    note(
      `${fps} fps: hand peak at +${((late.times.contact - truth.times.contact) * 1000).toFixed(0)} ms, ` +
        `fused contact at +${((skel.times.contact - truth.times.contact) * 1000).toFixed(0)} ms, ` +
        `from ${contact.from}, agreement ${contact.agreement}`,
    )
    assert(late.times.contact - truth.times.contact > 0.1, `${fps} fps: the dial did not make the hand late`)
    assert(contact.from === 'ball', `${fps} fps: a hand peak after the hit was believed`)
    within((skel.times.contact - truth.times.contact) * 1000, -10, 1000 / fps + 25, `${fps} fps contact against the true hit (ms)`)
    assert(skel.keys.contact <= truth.keys.contact + 1, `${fps} fps: the contact sample stayed late`)
    assert(skel.keys.toss < skel.keys.contact, 'the keyframes found again from the ball are out of order')
    assert(contact.agreement < 0.8, `${fps} fps: a disagreement this size left the contact readings unhedged`)
  }
})

heading('A hand lost before it reached the top')

check('a hand that stops short of the top is kept, and the disagreement hedges what is read there', () => {
  // The tracker loses the hand three samples before contact and lets it sink
  // from there: its "peak" is early, and the ball, still falling to the racket,
  // says so. (Held still instead, the hand's height is flat to the end of the
  // clip, its peak lands late, and the ball rightly overrules it — the case
  // above.) The
  // ball cannot overrule an early hand — it was not hit yet — so the hand
  // stands and every contact reading is hedged instead.
  const fps = 30
  const clean = buildServe({}, fps)
  const truth = detectServe(clean, fps)
  const frozenAt = truth.keys.contact - 3
  const frames = clean.map((f, i) =>
    i <= frozenAt
      ? f
      : {
          ...f,
          image: f.image.map((p, k) => {
            if (k !== WRIST) return p
            const lost = clean[frozenAt].image[WRIST]
            return { ...lost, y: lost.y + 0.02 * truth.bodyHeight * (i - frozenAt), visibility: 0.3 }
          }),
        },
  )
  const ball = tossedBall(frames, truth, truth.times.contact + 0.02)
  const { skel, contact } = detectWithContact(frames, fps, undefined, ball)
  note(
    `hand lost 3 samples early: hand at ${((contact.wrist - truth.times.contact) * 1000).toFixed(0)} ms, ` +
      `spread ${contact.spreadMs} ms, agreement ${contact.agreement}`,
  )
  assert(contact.from === 'wrist', 'a ball still falling overruled the hand')
  assert(contact.agreement < 1, 'the hand and ball a sixth of a second apart agreed')

  const ctx = (agreement: number): ConfidenceContext => ({
    frames,
    skel,
    swingSamples: 6,
    view: 'side',
    contactAgreement: agreement,
  })
  const hedged = metricConfidence('contactHeight', ctx(contact.agreement))
  const plain = metricConfidence('contactHeight', ctx(1))
  near(hedged / plain, contact.agreement, 1e-9, 'contact height carries the disagreement')
  near(metricConfidence('kneeBend', ctx(0.5)), metricConfidence('kneeBend', ctx(1)), 1e-9, 'the knee at the trophy')
  const why = softnessReason('contactHeight', ctx(0.5)) ?? ''
  assert(/hand and the ball/.test(why), `a soft contact reading was explained as "${why}"`)
})

heading('Contact height: the ball when it was there, the hand otherwise (D2.2)')

check('the card reads the ball at contact when the ball was followed to the racket', () => {
  const frames = buildServe({}, 30)
  const skel = detectServe(frames, 30)
  const ball = tossedBall(frames, skel, skel.times.contact + 0.02)
  const contact = readContact(frames, skel, ball)
  const card = measure(frames, skel, true, { ball, contact }).flatMap((f) => f.metrics)
  const ballRow = card.find((m) => m.id === 'ballContactHeight')
  const handRow = measure(frames, skel, true).flatMap((f) => f.metrics).find((m) => m.id === 'contactHeight')
  note(`ball at contact ${ballRow?.display} (${ballRow?.label}) · hand ${handRow?.display} (${handRow?.label})`)
  assert(Boolean(ballRow), 'a ball followed to the racket gave no ball height')
  assert(!card.some((m) => m.id === 'contactHeight'), 'the hand height stayed beside the ball height')
  assert(ballRow!.label === 'Ball height at contact', `the ball row is labelled "${ballRow!.label}"`)
  // The rig's ball meets the racket 0.2 body heights above the hand.
  near(ballRow!.value - handRow!.value, 0.2, 0.03, 'ball over hand at contact (body heights)')
})

check('without the ball, or with one lost out of reach, the hand is read and says so', () => {
  const frames = buildServe({}, 30)
  const skel = detectServe(frames, 30)
  for (const [what, ball] of [
    ['no ball', undefined],
    ['a ball lost high', tossedBall(frames, skel, skel.times.contact, skel.times.contact - 0.3)],
  ] as const) {
    const contact = readContact(frames, skel, ball)
    const card = measure(frames, skel, true, { ball, contact }).flatMap((f) => f.metrics)
    const hand = card.find((m) => m.id === 'contactHeight')
    assert(Boolean(hand), `${what}: no contact height at all`)
    assert(hand!.label === 'Hand height at contact', `${what}: the hand row is labelled "${hand!.label}"`)
    assert(!card.some((m) => m.id === 'ballContactHeight'), `${what}: a ball height with no ball at the racket`)
  }
})

report()
