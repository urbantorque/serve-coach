/**
 * The beginner's report, and whether it still has anything in it.
 *
 * A player with rigid legs and no racket drop is the commonest shape this app
 * will ever be shown and the exact population it was built for. On that serve
 * `phases.ts` cannot find a trophy or a drop as events of their own — they land
 * on the toss and on each other — and `metrics.ts` correctly refuses to report
 * `dropToContact`, `elbowAtDrop` and `loadRatio`, because each of them would
 * otherwise be a number about a keyframe that never happened. Every one of those
 * refusals is right, and the comments beside them each name a real clip and a
 * real wrong number.
 *
 * The cost is that the Swing card fell to one measurement and Rhythm to two: the
 * player who needs the most detail got the emptiest page. `handUnderElbow` is
 * the answer to that — a share of the toss-to-contact window rather than a
 * reading at an instant, so it exists whether or not the racket ever falls.
 *
 * This file holds both halves of that bargain at once. Adding a measurement that
 * survives the collapse is only an improvement if the four that do not survive
 * it still leave, so every check here asserts the new row and the missing rows
 * together. Split into two files they would drift, and the way they drift is a
 * measurement quietly coming back.
 */
import { measure } from '../metrics'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { METRICS } from '../coaching'
import { readoutOf } from '../anatomy'
import { assert, check, heading, note, report, within } from './harness'
import type { Fundamental, Metric } from '../types'

const FPS = 50

/**
 * Rigid legs and a racket that never falls behind the back: the hand stays
 * well above the shoulder (a hand that stops level with it is a full drop on
 * real motion — ANALYSIS-REVIEW.md §9).
 *
 * The same dials `engine.test.ts` calls the modal club serve, repeated here
 * rather than imported so that this file states the shape it is about. Both
 * copies are asserted to collapse before anything is measured from them, so a
 * rig change that quietly gave this serve a drop fails loudly instead of turning
 * every check below into a statement about a different player.
 */
const COLLAPSED: Partial<ServeDials> = { trophyKneeAngle: 170, dropBelowShoulder: -0.25 }

function analyse(dials: Partial<ServeDials>, fps = FPS) {
  const frames = buildServe(dials, fps)
  const skel = detectServe(frames, fps)
  const fundamentals = measure(frames, skel, true)
  const all = fundamentals.flatMap((f) => f.metrics)
  return {
    skel,
    fundamentals,
    all,
    has: (id: string) => all.some((m) => m.id === id),
    get: (id: string) => all.find((m) => m.id === id),
    area: (id: string) => fundamentals.find((f) => f.id === id) as Fundamental,
  }
}

/** The measurements the collapse takes away, and the comment that explains each. */
const DROPPED_BY_THE_COLLAPSE = ['dropToContact', 'elbowAtDrop', 'loadRatio']

heading('The serve with no drop still gets measured')

check('the collapsed serve is the serve this file claims it is', () => {
  const { skel } = analyse(COLLAPSED)
  assert(skel.derivation.dropOnTrophy, 'the rig gave the no-drop serve a drop of its own')
  assert(skel.derivation.trophyOnToss, 'the rig gave the rigid-legged serve a trophy of its own')
  note(
    `keys — toss ${skel.keys.toss}, trophy ${skel.keys.trophy}, drop ${skel.keys.drop}, contact ${skel.keys.contact}`,
  )
})

check('the hand-under-elbow share survives a swing with no drop to read', () => {
  const { get } = analyse(COLLAPSED)
  const hang = get('handUnderElbow')
  assert(Boolean(hang), 'the one swing measurement built to survive the collapse was dropped')
  note(`collapsed serve: ${hang!.display} · ${hang!.readout}`)
  // Low, and it should be: this player's hand never hangs under their elbow.
  // The point is that the app says so with a measurement rather than by leaving
  // the row off the card.
  within(hang!.value, 0, 8, 'hand-under-elbow share on a serve with no drop')
  assert(
    hang!.readout === readoutOf('handUnderElbow', hang!.value),
    'the readout and the value disagree',
  )
  assert(Boolean(hang!.fix), 'a share this far under the band arrived with no instruction')
})

check('and the measurements the collapse breaks are still gone', () => {
  // The other half of the bargain. A new row on the Swing card is worth nothing
  // if it arrives beside a drop-to-contact interval timed off a drop that never
  // happened — which is the failure the filters in `metrics.ts` exist to stop,
  // and the one a change to those filters would reintroduce silently.
  const { has } = analyse(COLLAPSED)
  for (const id of DROPPED_BY_THE_COLLAPSE) {
    assert(!has(id), `${id} came back on a serve with no drop and no trophy to read it from`)
  }
})

check('the swing card is no longer down to a single row', () => {
  const { area } = analyse(COLLAPSED)
  const swing = area('swing')
  const ids = swing.metrics.map((m) => m.id)
  note(`swing card: ${ids.join(', ')}`)
  assert(ids.includes('dropDepth'), 'the racket drop left the swing card')
  assert(ids.includes('handUnderElbow'), 'the surviving measurement is not on the swing card')
  assert(swing.metrics.length >= 2, `the swing card is back to ${swing.metrics.length} row(s)`)
})

check('the racket drop still leads the swing card, and still owns the fix', () => {
  // The new row must not take the headline off the fault that actually defines
  // this serve. `engine.test.ts` asserts the same thing from the other side; it
  // is repeated here because it is this file's change that could break it, and a
  // measurement that outscores the racket drop into the headline would hand the
  // player an instruction about their elbow for a serve with no swing in it.
  const { area, get } = analyse(COLLAPSED)
  const swing = area('swing')
  const depth = get('dropDepth')!
  const hang = get('handUnderElbow')!
  note(`dropDepth ${depth.score}, handUnderElbow ${hang.score} · headline: ${swing.headline}`)
  assert(
    depth.score < hang.score,
    `the racket drop (${depth.score}) no longer scores worst on a serve that has none (${hang.score})`,
  )
  assert(swing.headline === depth.insight, `the swing card leads with "${swing.headline}"`)
})

heading('What the share is actually reading')

check('it climbs with the racket drop, on serves the keyframes can see', () => {
  // The evidence that this is a measurement of the swing and not of the clip.
  // A number that survives the collapse and means nothing would be worse than
  // the empty card it replaced.
  const shares = [0, 0.1, 0.2, 0.3].map((dropBelowShoulder) => {
    const { get } = analyse({ dropBelowShoulder })
    return get('handUnderElbow')!.value
  })
  note(`drop 0 / 0.1 / 0.2 / 0.3 m → ${shares.map((s) => s.toFixed(1)).join(' / ')}`)
  for (let i = 1; i < shares.length; i++) {
    assert(
      shares[i] > shares[i - 1],
      `a deeper racket drop did not read as more hang: ${shares[i - 1]} → ${shares[i]}`,
    )
  }
})

check('the camera angle cannot move it', () => {
  // The reason it is only a vertical ordering of landmarks. `tossPathWobble` is
  // the cautionary tale: a reading taken along image x is two body axes mixed by
  // the camera, and the card is written in whichever one the phone happened to
  // favour. Which of two points sits higher in the frame is not mixed with
  // anything.
  const shares = [20, 45, 60, 89].map((cameraYaw) => analyse({ cameraYaw }).get('handUnderElbow')!.value)
  note(`yaw 20 / 45 / 60 / 89° → ${shares.map((s) => s.toFixed(1)).join(' / ')}`)
  for (const s of shares) {
    assert(Math.abs(s - shares[0]) < 1e-9, `the reading moved with the camera: ${shares.join(', ')}`)
  }
})

check('a racket left hanging by the hip does not read as a loaded arm', () => {
  // Why the reading requires the hand to be up off the hip line as well as under
  // the elbow. A hanging arm puts the elbow above the hand by construction, so
  // without that gate a player who never takes the racket back at all would
  // score full marks for an arm they never loaded — the same class of fault as
  // reporting a drop-to-contact interval for a drop that never happened, arriving
  // through a different door.
  const idle = buildServe({ noSwing: true }, FPS)
  const R = 14 // right elbow; the rig serves right-handed
  const W = 16
  const [hipL, hipR] = [23, 24]
  let elbowOverHand = 0
  let alsoUpOffTheHip = 0
  for (const f of idle) {
    if (f.image[R].y < f.image[W].y) {
      elbowOverHand++
      if (f.image[W].y < (f.image[hipL].y + f.image[hipR].y) / 2) alsoUpOffTheHip++
    }
  }
  note(`idling: elbow over the hand on ${elbowOverHand}/${idle.length} frames, up off the hip on ${alsoUpOffTheHip}`)
  assert(elbowOverHand > idle.length * 0.5, 'the rig did not produce a hanging arm to test against')
  assert(
    alsoUpOffTheHip === 0,
    `${alsoUpOffTheHip} frames of a racket hanging by the hip would have counted as a loaded arm`,
  )
})

check('a window too short to take a share of is left off the card', () => {
  // The measurement is dropped rather than reported coarsely when there are too
  // few samples — the house rule, applied to the one failure mode a share has
  // that a keyframe reading does not. Exercised through the same door a real
  // clip would come through: a frame rate low enough that the toss-to-contact
  // window stops holding enough samples to place a value against a rung.
  const scarce = analyse(COLLAPSED, 6)
  const plenty = analyse(COLLAPSED, 30)
  note(`6 fps: ${scarce.has('handUnderElbow') ? 'reported' : 'withheld'} · 30 fps: ${plenty.has('handUnderElbow') ? 'reported' : 'withheld'}`)
  assert(!scarce.has('handUnderElbow'), 'a share was taken of a window with almost nothing in it')
  assert(plenty.has('handUnderElbow'), 'a normal phone clip lost the measurement')
})

heading('The card it prints')

check('the copy on the card is the copy the database holds', () => {
  const { get } = analyse({})
  const hang = get('handUnderElbow') as Metric
  const copy = METRICS.handUnderElbow
  note(`clean serve: ${hang.display} · ${hang.readout} · target ${hang.target}`)
  assert(hang.label === copy.label, 'the card carries a different label')
  assert(hang.unit === '%', `the unit came through as "${hang.unit}"`)
  // A textbook drop belongs inside the provisional band. If this ever fails, the
  // band moved or the rig did, and the number to look at is in `coaching.ts`.
  within(hang.value, copy.ideal[0], copy.ideal[1], 'hand-under-elbow share on the clean rig serve')
  assert(!hang.fix, 'a serve inside the band was handed an instruction anyway')
})

report()
