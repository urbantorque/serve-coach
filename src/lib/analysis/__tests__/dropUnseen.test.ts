/**
 * A racket drop the camera lost is read as a racket that never fell (N2.5, KNOWN).
 *
 * Found on the retest bench (docs/next/LEDGER.md, N2.4 and N2.5): on 0SAQUE, a
 * 30 fps serve whose racket hand is below the shoulder for one or two frames,
 * copies that kept those frames found the drop 0.08 to 0.10 s before contact
 * and sat on the frame-count gate; copies that lost them put the drop exactly
 * on the trophy, and a drop on the trophy is read as a racket that never fell.
 * The card then says "Racket never falls" at the floor score and the diagnosis
 * names a shallow drop, for a drop that happened.
 *
 * The rig does the same here, on purpose: the dip is erased from the picture
 * (the world landmarks keep the real motion) and the read is pinned as it is
 * today. The first two checks are guards that must stay true. The last is a
 * KNOWN failure held in place: when a fix lands, it fails, and should become
 * the guard that a lost drop is withheld rather than called absent.
 */
import { diagnose } from '../diagnose'
import { measure } from '../metrics'
import { LM } from '../geometry'
import { detectServe } from '../phases'
import { buildServe } from '../syntheticServe'
import type { Frame } from '../types'
import { assert, check, heading, note, report } from './harness'

/**
 * The rig's serve with its dip lost, the way a smeared copy read: from just
 * after the trophy to contact the racket hand is held well above its shoulder
 * in the picture, except for one shallow low point a tenth of a second after
 * the trophy, which is all that is left of the drop.
 */
function withoutTheDip(fps: number): Frame[] {
  const frames = buildServe({}, fps)
  const skel = detectServe(frames, fps)
  const R = skel.racket === 'left' ? { wrist: LM.leftWrist, shoulder: LM.leftShoulder } : { wrist: LM.rightWrist, shoulder: LM.rightShoulder }
  const trophy = frames[skel.keys.trophy].t
  const from = trophy + 0.05
  const to = frames[skel.keys.contact].t - 0.02
  const low = trophy + 0.1
  return frames.map((f) => {
    if (f.t < from || f.t > to) return f
    const image = f.image.map((p) => ({ ...p }))
    const near = Math.abs(f.t - low) < 0.6 / fps
    image[R.wrist].y = image[R.shoulder].y - (near ? 0.08 : 0.16)
    return { ...f, image }
  })
}

heading('Where the drop is found on a clean serve')

check('the rig at 25, 30, 50, 60 and 120 fps finds its drop 110 to 230 ms before contact', () => {
  for (const fps of [25, 30, 50, 60, 120]) {
    const frames = buildServe({}, fps)
    const skel = detectServe(frames, fps)
    const gap = frames[skel.keys.contact].t - frames[skel.keys.drop].t
    note(`${fps} fps: drop ${gap.toFixed(3)} s before contact`)
    assert(gap >= 0.11 && gap <= 0.23, `${fps} fps: the drop was found ${gap.toFixed(3)} s before contact`)
    assert(!skel.derivation.dropOnTrophy, `${fps} fps: a clean drop landed on the trophy`)
  }
})

check('a racket held high through the swing is a racket that never fell', () => {
  const frames = buildServe({ dropBelowShoulder: -0.3 }, 30)
  assert(detectServe(frames, 30).derivation.dropOnTrophy, 'a racket that never fell was given a drop')
})

heading('A drop that may have fallen into a lost frame is not called absent (N2.5)')

/** The lost dip, with the frame where it would have been lost too, as the bench's smaller copy read. */
function withALostFrame(fps: number): Frame[] {
  const frames = withoutTheDip(fps)
  const skel = detectServe(frames, fps)
  const R = skel.racket === 'left' ? LM.leftWrist : LM.rightWrist
  const at = frames[skel.keys.contact].t - 0.1
  let lost = 0
  for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i].t - at) < Math.abs(frames[lost].t - at)) lost = i
  return frames.map((f, i) => {
    if (i !== lost) return f
    const image = f.image.map((p) => ({ ...p }))
    image[R].visibility = 0
    return { ...f, image }
  })
}

check('a frame lost in the drop stretch withholds the drop depth and names no shallow drop', () => {
  const frames = withALostFrame(30)
  const skel = detectServe(frames, 30)
  const drop = measure(frames, skel, true).flatMap((f) => f.metrics).find((m) => m.id === 'dropDepth')
  const named = diagnose(frames, skel).flaws.filter((f) => f.detected).map((f) => f.flaw)
  note(`drop on trophy ${skel.derivation.dropOnTrophy}; card: ${drop ? drop.readout : 'withheld'}; diagnosis: ${named.join(', ') || 'no faults'}`)
  assert(drop?.readout !== 'Racket never falls', 'a drop that may sit in a lost frame was called absent on the card')
  assert(!named.includes('shallow_drop'), 'a drop that may sit in a lost frame was named a shallow drop')
})

check('a racket held high, seen in every frame, is still told it never falls', () => {
  const frames = buildServe({ dropBelowShoulder: -0.3 }, 30)
  const skel = detectServe(frames, 30)
  const drop = measure(frames, skel, true).flatMap((f) => f.metrics).find((m) => m.id === 'dropDepth')
  note(`card: ${drop ? drop.readout : 'withheld'}`)
  assert(drop?.readout === 'Racket never falls', `a real "never falls" became ${drop ? drop.readout : 'withheld'}`)
})

heading('KNOWN: a drop lost from the picture is called absent (N2.5)')

check('KNOWN: with the dip erased, the card says the racket never falls and the diagnosis names a shallow drop', () => {
  const frames = withoutTheDip(30)
  const skel = detectServe(frames, 30)
  const drop = measure(frames, skel, true).flatMap((f) => f.metrics).find((m) => m.id === 'dropDepth')
  const named = diagnose(frames, skel).flaws.filter((f) => f.detected).map((f) => f.flaw)
  note(`drop on trophy ${skel.derivation.dropOnTrophy}; card: ${drop ? drop.readout : 'withheld'}; diagnosis: ${named.join(', ') || 'no faults'}`)
  assert(
    skel.derivation.dropOnTrophy && drop?.readout === 'Racket never falls' && named.includes('shallow_drop'),
    'this no longer calls a lost drop absent. If that is a fix, update N2.5 in the ledger and turn this ' +
      'check into the guard that a lost drop is withheld.',
  )
})

report()
