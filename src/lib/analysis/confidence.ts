/**
 * How much to trust each measurement, separately.
 *
 * The report already carries one confidence figure for the whole analysis, and
 * that is not enough, because degradation is local rather than global. Cropped
 * feet make the app fall back to a torso estimate of standing height, and that
 * bends every height ratio at once while leaving every joint angle untouched.
 * Few samples through the swing blur the drop-to-contact timing and nothing
 * else. Rigid legs make the trophy hard to place, which softens the four
 * measurements read at the trophy and no others.
 *
 * Reporting those as crisp numbers with coaching attached is the fastest way to
 * lose a player who knows their own serve: being told to fix a fault the app
 * cannot actually see reads as the app being wrong about everything. So each
 * measurement carries its own confidence, low ones are visibly hedged, and
 * `pickFocus` will not build the headline advice on one.
 */
import { LM, clamp, mean, type Side, sided } from './geometry'
import type { Skeleton } from './phases'
import type { Frame, Metric } from './types'

/** Below this a measurement is shown hedged and never becomes the focus. */
export const SOFT_MEASUREMENT = 0.55

/**
 * What each measurement rests on beyond the landmarks it reads directly.
 *
 * `scale` — divided by standing height, so it inherits any error in that.
 * `trophy` — read on the trophy frame, so it needs the trophy to be well placed.
 * `swingTiming` — resolved in time across the fastest part of the motion.
 * `depth` — needs the camera to see the player's depth, not just their outline.
 */
type Dependency = 'scale' | 'trophy' | 'swingTiming' | 'depth'

const DEPENDENCIES: Record<string, Dependency[]> = {
  // Toss
  tossPeakHeight: ['scale'],
  tossArmExtension: [],
  releaseHeight: ['scale'],
  tossArmHold: [],
  tossPathWobble: ['scale'],
  // Loading
  kneeBend: ['trophy'],
  hipShoulderSeparation: ['trophy', 'depth'],
  shoulderTilt: ['trophy', 'depth'],
  legDrive: ['scale', 'trophy'],
  // Swing
  dropDepth: ['scale'],
  elbowAtDrop: [],
  dropToContact: ['swingTiming'],
  // Contact
  contactHeight: ['scale'],
  contactBelowPeak: ['scale'],
  armExtension: [],
  bodyExtension: ['scale', 'trophy'],
  contactAhead: ['scale', 'depth'],
  // Rhythm
  totalTime: [],
  loadRatio: ['trophy'],
  syncAtRelease: ['scale'],
}

/** The landmarks each measurement is actually read from, for a visibility check. */
const LANDMARKS: Record<string, (racket: Side) => number[]> = {
  tossPeakHeight: () => [],
  tossArmExtension: (r) => armOf(other(r)),
  releaseHeight: (r) => [sided(other(r)).wrist],
  tossArmHold: (r) => [sided(other(r)).wrist, sided(other(r)).shoulder],
  tossPathWobble: (r) => [sided(other(r)).wrist],
  kneeBend: () => [LM.leftHip, LM.leftKnee, LM.leftAnkle, LM.rightHip, LM.rightKnee, LM.rightAnkle],
  hipShoulderSeparation: () => [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
  shoulderTilt: () => [LM.leftShoulder, LM.rightShoulder],
  legDrive: () => [LM.leftHip, LM.rightHip],
  dropDepth: (r) => [sided(r).wrist, sided(r).shoulder],
  elbowAtDrop: (r) => armOf(r),
  dropToContact: (r) => [sided(r).wrist],
  contactHeight: (r) => [sided(r).wrist],
  contactBelowPeak: () => [],
  armExtension: (r) => armOf(r),
  bodyExtension: () => [LM.leftAnkle, LM.rightAnkle],
  contactAhead: (r) => [sided(r).wrist, LM.leftHip, LM.rightHip],
  totalTime: () => [],
  loadRatio: () => [],
  syncAtRelease: (r) => [sided(r).wrist, sided(r).shoulder],
}

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left')
const armOf = (s: Side) => [sided(s).shoulder, sided(s).elbow, sided(s).wrist]

export interface ConfidenceContext {
  frames: Frame[]
  skel: Skeleton
  /** Samples captured between the racket drop and contact. */
  swingSamples: number
  view: 'side' | 'front-back' | 'angled'
  /** Set for measurements taken from the tracked ball rather than the body. */
  ballConfidence?: number
}

/**
 * Confidence for one measurement, 0–1.
 *
 * The factors multiply rather than average. Confidence here means "could this
 * number be wrong enough to change the advice", and any one broken input is
 * enough for that — a perfect view of a player whose feet are cropped still
 * gives a bad contact height. Averaging would let three healthy inputs paper
 * over the one that actually matters.
 */
export function metricConfidence(id: string, ctx: ConfidenceContext): number {
  const { skel } = ctx
  let c = 1

  for (const dep of DEPENDENCIES[id] ?? []) {
    if (dep === 'scale' && skel.derivation.scaleFromTorso) {
      // Torso length is about 30% of standing height, so the ratio that recovers
      // height from it multiplies the torso's own error by more than three.
      c *= 0.5
    }
    if (dep === 'trophy' && skel.derivation.trophyFromArms) {
      // The arm fallback puts the trophy in a sensible place, but a place found
      // from a different cue than the one the measurement assumes.
      c *= 0.7
    }
    if (dep === 'swingTiming') {
      // Four samples across a ~150 ms window leaves ±30 ms of quantisation on a
      // measurement whose whole target band is 120 ms wide.
      c *= clamp(ctx.swingSamples / 5, 0.3, 1)
    }
    if (dep === 'depth' && ctx.view !== 'angled') {
      // Dead side-on or dead front-on, one axis of the player's depth is
      // collapsed towards the lens and the pose model is inferring it.
      c *= 0.85
    }
  }

  // How well the landmarks this measurement reads were actually seen, over the
  // whole motion — a limb the tracker keeps losing gives a number built partly
  // from its guesses.
  const landmarks = LANDMARKS[id]?.(skel.racket) ?? []
  if (landmarks.length) {
    const win = ctx.frames.slice(skel.keys.ready, skel.keys.finish + 1)
    const seen = mean(
      win.map((f) => Math.min(...landmarks.map((lm) => f.image[lm]?.visibility ?? 0))),
    )
    c *= clamp((seen - 0.25) / 0.45, 0.25, 1)
  }

  if (ctx.ballConfidence !== undefined && (id === 'tossPeakHeight' || id === 'contactBelowPeak')) {
    c *= clamp(ctx.ballConfidence, 0, 1)
  }

  return clamp(c, 0, 1)
}

/**
 * Why a measurement is soft, in words the player can act on.
 *
 * Only ever one reason — the worst one. A list of caveats under a number reads
 * as the app hedging everything, and the player stops reading all of them.
 */
export function softnessReason(id: string, ctx: ConfidenceContext): string | undefined {
  const deps = DEPENDENCIES[id] ?? []
  if (deps.includes('scale') && ctx.skel.derivation.scaleFromTorso) {
    return 'Your feet were not in frame, so this is scaled from your upper body and is approximate.'
  }
  if (deps.includes('swingTiming') && ctx.swingSamples < 4) {
    return 'Your camera caught very few frames through the swing, so this timing is rough. Slow motion sharpens it.'
  }
  if (deps.includes('trophy') && ctx.skel.derivation.trophyFromArms) {
    return 'Your legs barely load, so the trophy position had to be found from your arms — this one is approximate.'
  }
  return 'Parts of your body were hard to make out here, so this reading is less certain than the rest.'
}

/** Confidence-weighted, so a measurement the app cannot see does not steer a score. */
export const effectiveWeight = (m: Pick<Metric, 'weight' | 'confidence'>) =>
  m.weight * clamp(m.confidence ?? 1, 0.15, 1)
