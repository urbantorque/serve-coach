/**
 * Clips the pose model could not read all the way through.
 *
 * The footage this app is built for is a phone propped on a fence in daylight,
 * and on that footage detection is not a solid line — it fails for a frame here
 * and a frame there, behind the body, through a smear, when the player walks in
 * front of a bright wall. `extractFrames` asks for an evenly spaced grid of
 * samples and does not get one back.
 *
 * Everything here is about the difference between the grid that was asked for
 * and the samples that came back. Two things went wrong at that seam, and both
 * were invisible on clean footage: search windows measured in array positions
 * quietly stretched in time, and the interpolator built for exactly this was
 * never connected to the measurements.
 */
import { bridgeDetectionGaps, MAX_BRIDGED_SAMPLES, MAX_BRIDGED_SPAN, type PoseSample } from '../kalman'
import { keyVisibility, LM } from '../geometry'
import { detectServe, type Keyframes } from '../phases'
import type { Frame } from '../types'
import { buildServe } from './syntheticServe'
import { assert, check, heading, near, note, report, within } from './harness'

const FPS = 50

/**
 * The rig's clip with more still air either side of the motion.
 *
 * `buildServe` clamps its interpolation outside the motion, so the frames before
 * and after it are a held pose — extending the clip with copies of them is the
 * same footage with the player standing there for longer, which is what the app
 * actually reads: `extractFrames` takes 1.9 s before contact and 0.8 s after.
 * It matters because a two-second lookback can only be mis-measured on a clip
 * with two seconds behind the toss to look back over.
 */
function padded(frames: Frame[], before: number, after: number, fps: number): Frame[] {
  const head = Array.from({ length: Math.round(before * fps) }, () => frames[0])
  const tail = Array.from({ length: Math.round(after * fps) }, () => frames[frames.length - 1])
  return [...head, ...frames, ...tail].map((f, i) => ({ ...f, index: i, t: i / fps }))
}

/**
 * Thin a clip the way a lossy tracker does: drop the misses, close the gap.
 *
 * The re-indexing is the whole point. `extractFrames` files each survivor at
 * `index: frames.length`, so the array comes out continuous while the
 * timestamps on it do not — which is the difference every check below turns on.
 */
function dropped(frames: Frame[], keep: (i: number) => boolean): Frame[] {
  return frames.filter((_, i) => keep(i)).map((f, i) => ({ ...f, index: i }))
}

/** Every keyframe as the moment it happened, which is the only comparable form. */
function times(frames: Frame[], fps: number): Record<keyof Keyframes, number> {
  const keys = detectServe(frames, fps).keys
  const out = {} as Record<keyof Keyframes, number>
  for (const [id, index] of Object.entries(keys)) out[id as keyof Keyframes] = frames[index].t
  return out
}

/* ================================================ windows measured in seconds */

heading('Keyframes on a clip with frames missing')

/** Three of every ten detections lost, spread out — one frame at a time. */
const SCATTERED = (i: number) => i % 10 !== 2 && i % 10 !== 5 && i % 10 !== 8
/** The same third lost in bursts, which is closer to how tracking actually fails. */
const BURSTY = (i: number) => i % 10 < 7

/**
 * Regression: every search window was sized as `seconds × fps` and then used as
 * a count of array positions. On a clip that lost a third of its detections the
 * array holds 0.7 samples per nominal frame, so a window meant to span half a
 * second spanned three quarters of one, and every keyframe found inside it
 * landed somewhere the serve was not. The worse the tracking, the further out it
 * drifted — which is precisely backwards.
 */
check('keyframes land at the same real times when a third of the frames are lost', () => {
  const full = padded(buildServe({}, FPS), 1.2, 1.0, FPS)
  const clean = times(full, FPS)

  for (const [label, keep] of [['scattered', SCATTERED], ['bursty', BURSTY]] as const) {
    const lossy = times(dropped(full, keep), FPS)
    const worst = Object.keys(clean)
      .map((id) => ({ id, off: Math.abs(lossy[id as keyof Keyframes] - clean[id as keyof Keyframes]) }))
      .sort((a, b) => b.off - a.off)[0]
    note(`${label}: worst drift ${worst.off.toFixed(3)}s on ${worst.id}`)
    for (const id of Object.keys(clean) as (keyof Keyframes)[]) {
      // Two 50 fps frames. A clip missing a third of its samples cannot place a
      // keyframe more precisely than the nearest surviving one, and that is the
      // whole of the error that should remain.
      near(lossy[id], clean[id], 0.05, `${label}: ${id}`)
    }
  }
})

check('the finish stays half a second after contact however many frames are lost', () => {
  // The sharpest form of the same bug, because this keyframe is not searched for
  // at all — it is contact plus a fixed span, so whatever the span is measuring
  // is exactly what comes out. In index space it read 0.71 s on a clip missing
  // 30% of its frames and 0.83 s on one missing 40%.
  const full = padded(buildServe({}, FPS), 1.2, 1.0, FPS)
  for (const [label, keep] of [
    ['complete', () => true],
    ['scattered', SCATTERED],
    ['bursty', BURSTY],
    ['heavy', (i: number) => i % 5 !== 0 && i % 5 !== 3],
  ] as const) {
    const frames = dropped(full, keep)
    const keys = detectServe(frames, FPS).keys
    const held = frames[keys.finish].t - frames[keys.contact].t
    note(`${label}: ${frames.length} of ${full.length} frames, finish at contact + ${held.toFixed(3)}s`)
    within(held, 0.45, 0.5, `${label}: finish after contact`)
  }
})

/* ================================================== bridging short detection gaps */

heading('Bridging over a detection the model missed')

/** The sampling grid `extractFrames` asks for, with `lost` slots coming back empty. */
function grid(frames: Frame[], lost: (i: number) => boolean): PoseSample[] {
  return frames.map((f, i) => ({
    t: f.t,
    pose: lost(i) ? null : { image: f.image, world: f.world },
  }))
}

/** How far a bridged landmark sits from the frame the tracker actually missed. */
const missBy = (bridged: Frame, truth: Frame, lm: number) =>
  Math.hypot(bridged.image[lm].x - truth.image[lm].x, bridged.image[lm].y - truth.image[lm].y)

/** The rig's 1.8 m player in image units, so a miss can be quoted as a ratio. */
const RIG_BODY_HEIGHT = 0.54

check('a gap of a frame or two is filled in from the motion either side', () => {
  const truth = buildServe({}, FPS)
  // Two samples lost through the racket drop — the fastest, least visible part
  // of the swing, and where a hole costs the most.
  const at = [58, 59]
  const bridged = bridgeDetectionGaps(grid(truth, (i) => at.includes(i)))

  assert(bridged.length === truth.length, `${bridged.length} frames back from ${truth.length} asked for`)
  for (const i of at) {
    const frame = bridged[i]
    near(frame.t, truth[i].t, 1e-9, `bridged frame ${i} is filed at the wrong moment`)
    const off = missBy(frame, truth[i], LM.rightWrist) / RIG_BODY_HEIGHT
    note(`frame ${i}: bridged wrist ${off.toFixed(4)} body heights from the truth`)
    // Inside the tracker's own frame-to-frame jitter, which is 0.5–1.5% of frame
    // height on a landmark it can see perfectly well.
    within(off, 0, 0.02, `bridged wrist at frame ${i}`)
  }
})

check('a long blackout is left as a hole rather than smoothed over', () => {
  const truth = buildServe({}, FPS)
  // Twelve samples — a quarter of a second — gone through the top of the swing.
  // A constant-velocity filter would coast a beautiful arc across it, through a
  // moment nobody filmed, and nothing downstream could tell.
  const from = 55
  const to = 67
  const bridged = bridgeDetectionGaps(grid(truth, (i) => i >= from && i < to))

  assert(
    bridged.length === truth.length - (to - from),
    `invented ${bridged.length - (truth.length - (to - from))} frames across a blackout`,
  )
  for (const f of bridged) {
    assert(
      f.t <= truth[from - 1].t + 1e-9 || f.t >= truth[to].t - 1e-9,
      `a frame came back at ${f.t.toFixed(3)}s, inside a gap nothing was seen in`,
    )
  }
  note(`${bridged.length} frames back from ${truth.length}, the blackout left open`)
})

check('the cap is on the coasted interval, not just the count of missing frames', () => {
  // A slow-motion clip samples so densely that three missing frames are a
  // twentieth of a second; a 24 fps phone clip stretches the same three across
  // an eighth. Only one of those is a limb briefly behind the body.
  const wide = bridgeDetectionGaps([
    { t: 0, pose: posed() },
    { t: 0.2, pose: null },
    { t: 0.4, pose: posed() },
  ])
  assert(wide.length === 2, 'bridged a 0.4 s coast as though it were one frame')
  assert(MAX_BRIDGED_SPAN <= 0.15, `the bridge may span ${MAX_BRIDGED_SPAN}s of a 150 ms swing`)
  assert(MAX_BRIDGED_SAMPLES <= 3, `up to ${MAX_BRIDGED_SAMPLES} frames may be invented in a row`)
})

check('an edge the clip never comes back from is never extrapolated', () => {
  // A hole with detections on both sides is interpolation. A hole at the end of
  // the clip is extrapolation, which is a different and much worse thing: there
  // is no evidence at all about where the motion went next.
  const truth = buildServe({}, FPS)
  const n = truth.length
  const bridged = bridgeDetectionGaps(grid(truth, (i) => i < 2 || i >= n - 2))
  assert(bridged.length === n - 4, `extrapolated ${bridged.length - (n - 4)} frames past the footage`)
})

/* ======================================================== staying honest about it */

heading('A bridged frame does not read as a detected one')

check('a bridged frame carries no visibility, so nothing counts it as seen', () => {
  const truth = buildServe({}, FPS)
  const at = [30, 31]
  const bridged = bridgeDetectionGaps(grid(truth, (i) => at.includes(i)))

  for (const i of at) {
    assert(
      keyVisibility(bridged[i]) === 0,
      `a frame nobody saw reports ${keyVisibility(bridged[i]).toFixed(2)} visibility`,
    )
    assert(
      bridged[i].world.every((l) => l.visibility === 0),
      'a bridged world landmark claims to have been seen',
    )
  }
  // And every frame the model did produce is handed back exactly as it came, so
  // the blur statistic still reads real detections rather than the filter's own
  // idea of where the hand should have been.
  assert(bridged[29].image[LM.rightWrist] === truth[29].image[LM.rightWrist], 'a detected frame was rewritten')
})

check('bridging a gap in the swing does not buy back the samples it cost', () => {
  // `swingSamples` is what the report leans on to decide whether the drop and
  // contact can be told apart in time at all. Interpolated frames improve where
  // the keyframes sit; they add no evidence, and counting them would let a clip
  // talk its way out of the one warning it has earned.
  const truth = buildServe({}, FPS)
  const complete = bridgeDetectionGaps(grid(truth, () => false))
  const holed = bridgeDetectionGaps(grid(truth, (i) => i === 80 || i === 81))
  const between = (frames: Frame[], from: number, to: number) =>
    frames.slice(from + 1, to + 1).filter((f) => keyVisibility(f) > 0).length

  const a = detectServe(complete, FPS).keys
  const b = detectServe(holed, FPS).keys
  note(`swing samples: ${between(complete, a.drop, a.contact)} clean, ${between(holed, b.drop, b.contact)} with two lost`)
  assert(
    between(holed, b.drop, b.contact) < between(complete, a.drop, a.contact),
    'two lost detections through the swing were counted back as captured samples',
  )
})

/** A pose whose landmarks are all present, for the shape-only checks above. */
function posed() {
  const one = { x: 0.5, y: 0.5, z: 0, visibility: 1 }
  return { image: Array.from({ length: 33 }, () => ({ ...one })), world: Array.from({ length: 33 }, () => ({ ...one })) }
}

report()
