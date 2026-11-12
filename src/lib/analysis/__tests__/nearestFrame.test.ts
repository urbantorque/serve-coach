/**
 * Finding the sampled frame under the playhead.
 *
 * This was a `useCallback` inside `PosePlayer`, which put a binary search and a
 * nearest-neighbour tie-break somewhere nothing could reach. It is worth
 * reaching because the player itself reasons at length about the case where it
 * goes wrong: on a clip whose frames sit more than half a sample off the pose
 * cadence, the moment playback reports is nearest the *neighbour* of the sample
 * a keyframe was measured at. Whether that is a near miss or a wild one is decided entirely by the
 * rounding here — and the symptom is a no-op rather than a crash, which is the
 * kind of bug nobody reports.
 */
import { nearestFrameIndex } from '../geometry'
import { assert, check, heading, note, report } from './harness'

/** A run of samples at a fixed rate, the way the extraction produces them. */
const at = (times: number[]) => times.map((t) => ({ t }))

/** 32 Hz, which is `FINE_FPS` — the rate an even read is sampled at. */
const cadence = at(Array.from({ length: 40 }, (_, i) => i / 32))

heading('The frame under the playhead')

check('an exact hit returns that frame, not a neighbour', () => {
  for (const i of [0, 1, 17, 39]) {
    const found = nearestFrameIndex(cadence, cadence[i].t)
    assert(found === i, `asked for frame ${i} at t=${cadence[i].t}, got ${found}`)
  }
})

check('a moment between two samples takes the nearer one', () => {
  // Nearest rather than next-lowest, deliberately: picking the earlier frame
  // every time biases the whole overlay half a sample behind the video, which
  // reads as a skeleton trailing the body rather than sitting on it.
  const gap = cadence[10].t - cadence[9].t
  assert(nearestFrameIndex(cadence, cadence[9].t + gap * 0.4) === 9, 'rounded up too early')
  assert(nearestFrameIndex(cadence, cadence[9].t + gap * 0.6) === 10, 'rounded down too late')
  note(`sample gap ${(gap * 1000).toFixed(1)} ms at 32 Hz`)
})

check('a moment before the clip starts clamps to the first frame', () => {
  // Reachable: `draw` allows a 50 ms slop either side of the window before it
  // gives up, so the playhead can legitimately sit just outside.
  assert(nearestFrameIndex(cadence, -5) === 0, 'ran off the front of the array')
})

check('a moment past the end clamps to the last frame', () => {
  const last = cadence.length - 1
  assert(nearestFrameIndex(cadence, 999) === last, 'ran off the end of the array')
})

check('an empty run answers without throwing', () => {
  // A stored report has no frames at all. `PosePlayer` indexes the result and
  // handles `undefined`, but only if it gets an index rather than an exception.
  const found = nearestFrameIndex([], 1.5)
  assert(Number.isInteger(found), `an empty run produced ${found}`)
})

check('one frame is always the answer', () => {
  assert(nearestFrameIndex(at([4]), 0) === 0, 'missed the only frame from before it')
  assert(nearestFrameIndex(at([4]), 99) === 0, 'missed the only frame from after it')
})

heading('The case the player itself warns about')

check('an uneven run — a bridged gap — still finds the nearest', () => {
  // `bridgeDetectionGaps` leaves long gaps open, so the array is sorted but not
  // evenly spaced. A search that assumed a fixed cadence would divide its way to
  // the wrong side of a hole.
  const holed = at([0, 0.03, 0.06, 0.5, 0.53, 0.56])
  assert(nearestFrameIndex(holed, 0.07) === 2, 'crossed a gap it should not have')
  assert(nearestFrameIndex(holed, 0.49) === 3, 'did not reach across the gap when it should')
  assert(nearestFrameIndex(holed, 0.2) === 2, 'a moment inside the gap did not take the nearer edge')
  assert(nearestFrameIndex(holed, 0.4) === 3, 'a moment inside the gap did not take the nearer edge')
})

check('an exact tie takes the later frame, consistently', () => {
  // Not arbitrary and not important, but it has to be *one* of them: the
  // tie-break is `<` rather than `<=`, so the frame at or after the playhead
  // wins. Written down because this check was first drafted asserting the
  // opposite and the code was right — a moment exactly between two samples is a
  // real case on a bridged gap, where the two edges can be a third of a second
  // apart and the midpoint is a round number.
  const tie = at([0, 0.06, 0.5])
  assert(nearestFrameIndex(tie, 0.28) === 2, 'the tie-break stopped being consistent')
  assert(nearestFrameIndex(tie, 0.03) === 1, 'the tie-break disagrees with itself at another gap')
})

check('a snapped playhead lands within one sample of where it was measured', () => {
  // The documented failure mode, bounded rather than denied. Wherever the
  // decoder snaps to, the frame returned is never more than one sample away
  // from the frame whose time was asked for — so a keyframe callout can be off
  // by a neighbour, and never by an arbitrary amount.
  const gap = 1 / 32
  for (let i = 0; i < cadence.length; i++) {
    for (const drift of [-0.49, -0.2, 0, 0.2, 0.49]) {
      const found = nearestFrameIndex(cadence, cadence[i].t + gap * drift)
      assert(
        Math.abs(found - i) <= 1,
        `a playhead ${drift} of a sample from frame ${i} landed on ${found}`,
      )
    }
  }
})

check('the answer never leaves the array', () => {
  // The property that matters most, stated over the whole range rather than at
  // chosen points: every caller indexes straight into `frames` with this.
  for (let t = -1; t < 3; t += 0.017) {
    const found = nearestFrameIndex(cadence, t)
    assert(found >= 0 && found < cadence.length, `t=${t.toFixed(3)} produced index ${found}`)
  }
})

report()
