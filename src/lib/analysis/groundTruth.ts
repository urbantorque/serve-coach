/**
 * Validating the engine against real footage.
 *
 * The synthetic rig proves the maths is self-consistent, but it cannot prove the
 * engine agrees with reality: it has no motion blur, no rolling shutter, no
 * far-side limb guessed at from behind a torso, and its world-landmark z is
 * exact where MediaPipe's is the noisiest thing it outputs. Those are precisely
 * the conditions the measurements have to survive, and the only way to know they
 * do is to check the pipeline against clips a human has labelled.
 *
 * A fixture stores the *pose output* rather than the video, which is what makes
 * this testable at all: the checks run in Node with no browser, no decode and no
 * model, they are a few hundred kilobytes rather than a few hundred megabytes,
 * and — because the recorded landmarks never change — a regression can only come
 * from the analysis code, which is the thing under test.
 *
 * DOM-free by construction, so the test runner can import it directly.
 */
import { LM } from './geometry'
import { measure } from './metrics'
import { detectServe } from './phases'
import type { Frame, Landmark, PhaseId, Quality } from './types'

/* ------------------------------------------------------------------ packing */

/**
 * Frames flattened into number arrays and rounded.
 *
 * Stored as JSON so a fixture is reviewable in a diff, but one frame is 33
 * landmarks in two coordinate spaces — as objects that is ~40 kB a frame and a
 * 120-frame clip becomes a 5 MB file nobody will commit. Flattened and rounded
 * to the precision the tracker actually resolves, the same clip is ~250 kB.
 */
export interface PackedFrames {
  count: number
  /** Sample times in seconds. */
  t: number[]
  /** count × 33 × 4, as x, y, z, visibility. */
  image: number[]
  world: number[]
}

/**
 * Rounding is deliberate, not incidental: image coords are a fraction of the
 * frame and world coords are metres, so they need different precision to keep
 * the same physical resolution. 5 dp of a frame is well under a pixel; 4 dp of a
 * metre is a tenth of a millimetre. Both are far finer than the tracker's own
 * repeatability, so nothing measurable is lost.
 */
const round = (v: number, dp: number) => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

export function packFrames(frames: Frame[]): PackedFrames {
  const image: number[] = []
  const world: number[] = []
  const t: number[] = []

  for (const f of frames) {
    t.push(round(f.t, 4))
    for (let i = 0; i < 33; i++) {
      const im = f.image[i] ?? { x: 0, y: 0, z: 0, visibility: 0 }
      image.push(round(im.x, 5), round(im.y, 5), round(im.z, 5), round(im.visibility, 3))
      const w = f.world[i] ?? { x: 0, y: 0, z: 0, visibility: 0 }
      world.push(round(w.x, 4), round(w.y, 4), round(w.z, 4), round(w.visibility, 3))
    }
  }

  return { count: frames.length, t, image, world }
}

export function unpackFrames(packed: PackedFrames): Frame[] {
  const frames: Frame[] = []
  for (let i = 0; i < packed.count; i++) {
    const read = (src: number[]): Landmark[] => {
      const out: Landmark[] = []
      for (let k = 0; k < 33; k++) {
        const o = (i * 33 + k) * 4
        out.push({ x: src[o], y: src[o + 1], z: src[o + 2], visibility: src[o + 3] })
      }
      return out
    }
    frames.push({ index: i, t: packed.t[i], image: read(packed.image), world: read(packed.world), visibility: 0 })
  }
  return frames
}

/* ----------------------------------------------------------------- fixtures */

export interface FixtureExpectation {
  /** Which hand actually held the racket. */
  handedness?: 'right' | 'left'
  view?: Quality['view']
  /**
   * Hand-labelled keyframe times in seconds, read off the clip by scrubbing.
   * Partial is fine — label the ones you are sure of and leave the rest out.
   */
  keyframes?: Partial<Record<PhaseId, number>>
  /**
   * Values measured outside the app: contact height off a wall mark, knee angle
   * from a protractor on a paused frame, drop-to-contact from the frame count.
   * These are the only assertions here that can catch the engine being
   * self-consistently wrong.
   */
  metrics?: Record<string, number>
  /** The clip should be rejected as not-a-serve. */
  rejected?: boolean
}

export interface Fixture {
  id: string
  /** Human description: "adult male, side-on, 240 fps slow motion, iPhone 13". */
  label: string
  /**
   * `recorded` came off a real camera. `synthetic` came from the rig and exists
   * to prove this harness runs, not to validate anything about reality — a suite
   * of only synthetic fixtures is worth exactly nothing here.
   */
  source: 'recorded' | 'synthetic'
  notes?: string
  /** Sampled frames per second, as `extractFrames` reported it. */
  fps: number
  frames: PackedFrames
  expect: FixtureExpectation
  tolerance?: Partial<Tolerance>
}

export interface Tolerance {
  /** Seconds a detected keyframe may sit away from its label. */
  keyframeSeconds: number
  /** Tighter for contact, which a human can label to the frame. */
  contactSeconds: number
  /** Per-unit allowance for a measured value: degrees, body-heights, ms, %. */
  degrees: number
  ratio: number
  ms: number
  percent: number
}

/**
 * Defaults sized to what a human labeller can actually resolve, not to what
 * would make the suite pass. A keyframe scrubbed by eye on 30 fps footage is
 * good to about two frames; contact is the one moment anybody can pick exactly,
 * so it gets a tighter bound. The metric allowances are roughly the width of the
 * band each measurement is scored against divided by four — tight enough that a
 * miss changes the advice the player is given, which is the standard that
 * matters.
 */
export const DEFAULT_TOLERANCE: Tolerance = {
  keyframeSeconds: 0.09,
  contactSeconds: 0.05,
  degrees: 9,
  ratio: 0.07,
  ms: 45,
  percent: 9,
}

const UNIT_KEY: Record<string, keyof Tolerance> = {
  '°': 'degrees',
  '×': 'ratio',
  ms: 'ms',
  '%': 'percent',
}

export interface FixtureIssue {
  what: string
  expected: number | string
  actual: number | string
  /** How far out, in the metric's own unit. Absent for non-numeric mismatches. */
  error?: number
}

export interface FixtureResult {
  id: string
  label: string
  source: Fixture['source']
  passed: boolean
  issues: FixtureIssue[]
  /** Signed error per labelled keyframe, in seconds. Useful even when passing. */
  keyframeError: Partial<Record<PhaseId, number>>
  metricError: Record<string, number>
  /** Why the fixture could not be run at all, if it could not. */
  error?: string
}

/**
 * Run one labelled clip through the pipeline and report every disagreement.
 *
 * Reports all of them rather than throwing on the first, because when a change
 * to the detector moves things, the useful output is the full pattern of what
 * moved and by how much — one assertion failure tells you almost nothing about
 * whether you have broken the trophy or shifted every keyframe by a frame.
 */
export function validateFixture(fixture: Fixture): FixtureResult {
  const tol = { ...DEFAULT_TOLERANCE, ...fixture.tolerance }
  const result: FixtureResult = {
    id: fixture.id,
    label: fixture.label,
    source: fixture.source,
    passed: true,
    issues: [],
    keyframeError: {},
    metricError: {},
  }

  const fail = (issue: FixtureIssue) => {
    result.issues.push(issue)
    result.passed = false
  }

  const frames = unpackFrames(fixture.frames)

  let skel: ReturnType<typeof detectServe>
  try {
    skel = detectServe(frames, fixture.fps)
  } catch (err) {
    // A clip labelled as not-a-serve *should* land here.
    if (fixture.expect.rejected) return result
    result.passed = false
    result.error = (err as Error).message
    return result
  }

  if (fixture.expect.rejected) {
    fail({ what: 'clip should have been rejected', expected: 'rejected', actual: 'analysed' })
    return result
  }

  if (fixture.expect.handedness && skel.racket !== fixture.expect.handedness) {
    fail({
      what: 'handedness',
      expected: fixture.expect.handedness,
      actual: skel.racket,
    })
  }

  for (const [phase, labelled] of Object.entries(fixture.expect.keyframes ?? {})) {
    if (typeof labelled !== 'number') continue
    const idx = skel.keys[phase as keyof typeof skel.keys]
    const detected = frames[idx]?.t
    if (detected === undefined) continue
    const error = detected - labelled
    result.keyframeError[phase as PhaseId] = Number(error.toFixed(4))
    const allowed = phase === 'contact' ? tol.contactSeconds : tol.keyframeSeconds
    if (Math.abs(error) > allowed) {
      fail({ what: `keyframe ${phase}`, expected: labelled, actual: detected, error })
    }
  }

  const expectedMetrics = fixture.expect.metrics
  if (expectedMetrics && Object.keys(expectedMetrics).length > 0) {
    // The view drives which metrics exist at all, so derive it the same way the
    // pipeline does rather than trusting the label.
    const spanRatio = skel.shoulderWidth / skel.bodyHeight
    const sideView = fixture.expect.view ? fixture.expect.view === 'side' : spanRatio < 0.1
    const produced = measure(frames, skel, sideView).flatMap((f) => f.metrics)

    for (const [id, expected] of Object.entries(expectedMetrics)) {
      const m = produced.find((x) => x.id === id)
      if (!m) {
        fail({ what: `metric ${id}`, expected, actual: 'not produced' })
        continue
      }
      const error = m.value - expected
      result.metricError[id] = Number(error.toFixed(4))
      const allowed = tol[UNIT_KEY[m.unit] ?? 'ratio']
      if (Math.abs(error) > allowed) {
        fail({ what: `metric ${id}`, expected, actual: Number(m.value.toFixed(3)), error })
      }
    }
  }

  return result
}

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
    frames.filter((f) => (f.image[lm]?.visibility ?? 0) > 0.5).length / frames.length

  const feet = Math.max(
    Math.min(seen(LM.leftAnkle), seen(LM.rightAnkle)),
    Math.min(seen(LM.leftHeel), seen(LM.rightHeel)),
  )
  if (feet < 0.5) issues.push('feet-cropped')

  const head = seen(LM.nose)
  if (head < 0.5) issues.push('head-cropped')

  const torso = Math.min(seen(LM.leftShoulder), seen(LM.rightShoulder), seen(LM.leftHip))
  if (torso < 0.5) issues.push('body-unclear')

  // The player standing so small in frame that the tracker has little to work
  // with. Measured head-to-ankle against the frame height.
  const heights = frames
    .map((f) => Math.abs((f.image[LM.leftAnkle]?.y ?? 0) - (f.image[LM.nose]?.y ?? 0)))
    .filter((h) => h > 0)
  const typical = heights.length ? heights.sort((a, b) => a - b)[heights.length >> 1] : 0
  if (typical > 0 && typical < 0.3) issues.push('too-far-away')

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
