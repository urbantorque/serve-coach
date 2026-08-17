/**
 * What the image's x axis actually measures, given where the phone stood.
 *
 * Two measurements in this engine read raw image x and call the answer
 * sideways: `tossPathWobble` (metrics.ts) and `lateralDrift` (diagnose.ts).
 * Image x is not sideways. It is whichever horizontal body axis the camera
 * happened to lay across the sensor, and which one that is depends entirely on
 * where the phone stood.
 *
 * The rig's own default is the case worth stating in numbers. At 82° — dead
 * side-on, what engine.test.ts films at, and roughly where a player who props a
 * phone on the next court ends up — a metre along the player's front/back axis
 * lands as 0.990 of a metre of image x, and a metre across their body lands as
 * 0.139. So a 2 cm toss error to the side arrives as 2.8 mm of "sideways
 * wobble", while the same 2 cm error forwards arrives as 19.8 mm: one number,
 * two meanings, seven times apart. Film the same serve face-on and the two
 * swap over completely. Nothing downstream can tell which clip it was handed.
 *
 * The synthetic rig says the same thing in one line. syntheticServe.ts:490
 * projects with `x * cos(cam) - z * sin(cam)`, `cam = 90° - cameraYaw`, where
 * world x is the net-ward axis (syntheticServe.ts:380) and world z is across
 * the player. That is the whole of the geometry here: image x carries the depth
 * axis with gain sin(yaw) and the lateral axis with gain cos(yaw). Worth
 * noticing that the rig's own `tossWobble` dial (syntheticServe.ts:72) is
 * documented as sideways and is applied to world x — the net-ward axis — which
 * is why `tossPathWobble` has always looked like it worked: at the default 82°
 * the dial is driving the axis image x can actually see.
 *
 * This file is the one place that conversion lives, so the toss-drift work and
 * the capture-time framing check cannot answer the question two different ways.
 * It measures nothing itself and owns no thresholds of its own: the yaw comes
 * from `assessSpatial`, and the two angles at which an axis stops being
 * readable at all are the ends of `DEPTH_YAW_RANGE`, which spatial.ts already
 * argued for and this file deliberately does not restate with sibling numbers
 * of its own.
 *
 * Two things this cannot do, stated here so nothing downstream assumes them:
 *
 * - No sign. Yaw arrives from an `acos` (spatial.ts:153), so it cannot tell a
 *   camera in front of the player from one behind, nor one shoulder side from
 *   the other. The magnitude of a drift along a named axis is recoverable; the
 *   direction — forwards or back, left or right — is not, from yaw alone. Any
 *   sign a caller carries through is the image's, not the court's.
 * - No de-mixing. One image-x scalar cannot be split into two components; that
 *   needs two independent readings and there is only ever one. So a reading is
 *   attributed to one axis and its confidence states, honestly, how much of it
 *   could have been the other axis instead.
 */
import { clamp } from './geometry'
import { DEPTH_YAW_RANGE, type Spatial } from './spatial'

/**
 * The two horizontal axes of the player's own body.
 *
 * `depth` is front/back — how far in front of the body contact happens, the
 * axis spatial.ts:66 names when it talks about depth. `lateral` is across the
 * body, along the shoulder line. Both are horizontal; image y is vertical for
 * every camera this app accepts and is not this file's business.
 */
export type BodyAxis = 'depth' | 'lateral'

/** Which body axes image x can still be read for at this camera angle. */
export type Framing = 'both_axes' | 'depth_only' | 'lateral_only' | 'unknown'

export interface AxisInImageX {
  axis: BodyAxis
  /**
   * How much of a movement along this axis survives into image x, 0–1.
   *
   * A drift of 1 body height along the axis shows up as `gain` body heights of
   * image x. Dividing an image-x reading by it is the only way back, which is
   * also why a small gain is not merely imprecise but unusable: at 85° the
   * lateral gain is 0.087, so recovering a lateral drift there would multiply
   * the reading — and every bit of landmark jitter in it — by 11.5.
   */
  gain: number
  /**
   * The share of an image-x reading that is honestly this axis, 0–1.
   *
   * `gain²`, because the two gains are the legs of a unit vector and squaring
   * them gives each axis's share of the x variance of a movement that was equal
   * in both. That assumption is the honest worst case for a wobble: a toss that
   * wanders 2 cm forwards probably also wanders a bit sideways, and nothing in
   * the clip says how much. The two shares therefore always sum to 1 — this is
   * a split of one reading, never a measurement of two.
   */
  share: number
  /**
   * Whether image x carries this axis at all at this angle.
   *
   * False outside `DEPTH_YAW_RANGE`, where spatial.ts has already concluded
   * that one body axis is pointing at the lens and the model is inferring its
   * extent rather than seeing it. Only one axis can fail this at a time: the
   * gains are a sine and a cosine, so where one is below its end of the window
   * the other is above 0.95.
   */
  readable: boolean
}

export interface ImageXSplit {
  /** The yaw this split was built from, 0–90. Null when none could be read. */
  yaw_deg: number | null
  depth: AxisInImageX
  lateral: AxisInImageX
  /**
   * The axis image x mostly carries, or null when neither owns it.
   *
   * Null at exactly 45°, where the two gains are equal and calling the reading
   * either name would be a coin toss dressed up as a measurement. 45 is also
   * what `estimateYaw` returns when it cannot measure at all (spatial.ts:138,
   * 150). This cannot tell the two apart and does not try — the answer is the
   * same either way, which is that no axis owns image x here.
   */
  dominant: BodyAxis | null
  /** What a capture-time framing check should act on. */
  framing: Framing
  /**
   * The spatial pass's own confidence in the *angle* this split rests on.
   *
   * Carried rather than folded in silently, because a yaw recovered from a
   * rolled phone is a shakier yaw and every reading taken through this split
   * inherits that. `readImageX` multiplies by it the same way `assessSpatial`
   * multiplies its own independent costs together.
   *
   * `Spatial.roll_confidence`, not `Spatial.confidence`, and the difference is
   * the whole argument for this file existing. `confidence` folds in
   * `depth_unreliable`, which asks whether the pose model had to infer world z —
   * a question nothing here touches, since a split of image x is trigonometry on
   * an angle. Folding it in cost a dead side-on clip a quarter of its confidence
   * at exactly the angle where 0.992 of the reading is honestly one axis, put a
   * 25% cliff between 78° and 79° where the split changes by 0.007, and priced a
   * genuine corner camera at 57° — where 30% of the reading really is the other
   * axis — within 0.04 of the side-on one. The share already carries the axis
   * doubt; this factor carries only the doubt about the angle it was computed
   * from.
   */
  spatial_confidence: number
}

export interface AxisReading {
  /**
   * The movement along the requested axis, in the units of the image-x reading
   * that was handed in. Null when the camera angle cannot support the question.
   *
   * The sign is the image's, not the court's — see the note at the top of this
   * file. A caller that needs forwards-versus-back needs something this helper
   * does not have.
   */
  value: number | null
  /** 0–1: the share of the reading that is this axis, times spatial's own. */
  confidence: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * What image x means at a measured camera yaw.
 *
 * `spatialConfidence` is `Spatial.confidence` when there is one; the default of
 * 1 is for callers holding a bare angle — a live framing check reading the
 * viewfinder has no analysed clip to ask.
 */
export function imageXSplit(yawDeg: number, spatialConfidence = 1): ImageXSplit {
  const conf = Number.isFinite(spatialConfidence) ? clamp(spatialConfidence, 0, 1) : 0

  // Yaw comes out of an `acos` and cannot leave 0–90. A value outside it is a
  // caller holding something that is not this quantity, and clamping would turn
  // that mistake into a confident claim about which axis image x is — so it is
  // refused instead, the same way a missing yaw is.
  if (!Number.isFinite(yawDeg) || yawDeg < 0 || yawDeg > 90) {
    return {
      yaw_deg: null,
      depth: { axis: 'depth', gain: 0, share: 0, readable: false },
      lateral: { axis: 'lateral', gain: 0, share: 0, readable: false },
      dominant: null,
      framing: 'unknown',
      spatial_confidence: conf,
    }
  }

  // Side-on the shoulder line points at the lens, so image x runs front-to-back
  // along the player: all depth, no lateral. Face-on it is the other way round.
  // Everything between is these two, mixed in exactly this proportion.
  const depthGain = Math.sin(rad(yawDeg))
  const lateralGain = Math.cos(rad(yawDeg))

  // Inclusive at both ends, matching spatial.ts:76 exactly — `depth_unreliable`
  // is `yaw < 18 || yaw > 78`, so 18 and 78 are angles it still accepts. Split
  // per axis rather than as one flag, because the two ends fail opposite axes:
  // below 18° it is depth that has collapsed into the lens (gain 0.309 and
  // falling), above 78° it is the lateral axis (gain 0.208 and falling).
  const depthReadable = yawDeg >= DEPTH_YAW_RANGE[0]
  const lateralReadable = yawDeg <= DEPTH_YAW_RANGE[1]

  return {
    yaw_deg: yawDeg,
    depth: {
      axis: 'depth',
      gain: depthGain,
      share: depthGain * depthGain,
      readable: depthReadable,
    },
    lateral: {
      axis: 'lateral',
      gain: lateralGain,
      share: lateralGain * lateralGain,
      readable: lateralReadable,
    },
    // Decided on the angle rather than by comparing the two gains, because at
    // the tie the comparison does not tie: Math.cos(π/4) comes out one bit above
    // Math.sin(π/4), so `lateralGain > depthGain` and a dead corner camera was
    // told image x was across the body. 45 is not a threshold here — it is
    // where sin and cos cross, the one angle at which image x is exactly half
    // of each — so this is an equality test, not a judgement call.
    //
    // WHICH MEANS THE NULL CASE HAS NEVER HAPPENED, and R80 measured what that
    // costs. `estimateYaw` returns a measurement; it will not return 45.0000000.
    // So the tie-drop that this comment and two more in `diagnose.ts` describe
    // fires on exactly one float value and never in practice — and at 45.1° the
    // app commits to an axis on a coin flip. Dial a purely lateral toss wobble at
    // 45° and it is reported as a forwards-and-back fault, detected, at 0.52
    // confidence, seven hundredths above `MIN_EVIDENCE`.
    //
    // The confidence does not stand in for the guard either, because `share`
    // answers how much of *image x* is this axis, not how much of the *toss* was
    // seen. Side-on the app reads 0.99 — it knows perfectly which axis image x
    // carries — while being blind to the other one. It is most confident exactly
    // where it sees least.
    //
    // The fix is a share floor, and it silences the toss verdict across a band of
    // near-corner clips, so it needs a derivation and a number diff rather than a
    // guess. R80b. Pinned in `depth.test.ts` meanwhile.
    dominant: yawDeg > 45 ? 'depth' : yawDeg < 45 ? 'lateral' : null,
    framing: depthReadable && lateralReadable ? 'both_axes' : depthReadable ? 'depth_only' : 'lateral_only',
    spatial_confidence: conf,
  }
}

/**
 * The same split, taken from an analysed clip.
 *
 * The two-argument form exists so that a reading's confidence is the product of
 * how cleanly the axes separate *and* how much the spatial pass trusts the
 * angle it recovered. Dropping the second would let a clip shot through a fence
 * with the phone at 20° of roll hand out the same crisp split as a tripod.
 *
 * Which is why it is `roll_confidence` and not `confidence` — see
 * `spatial_confidence` above for what the other factor was costing and where.
 */
export function imageXSplitFrom(spatial: Spatial): ImageXSplit {
  return imageXSplit(spatial.yaw_deg, spatial.roll_confidence)
}

/**
 * Read an image-x number as movement along one named body axis.
 *
 * `dxImage` is whatever the caller measured along image x — a detrended wobble,
 * a drift, a span — in its own units; what comes back is in those same units.
 *
 * Refuses rather than scales when the axis has collapsed into the lens. That is
 * the one case where returning a number would be worse than returning nothing:
 * the arithmetic still works, `dx / 0.087` produces a confident-looking
 * quantity, and what it is made of is landmark jitter multiplied by eleven.
 * Everywhere else it answers and lets the confidence carry the doubt, which is
 * how this codebase degrades a marginal clip — the reading survives at 0.25
 * confidence and the evidence gates downstream decide whether that is enough to
 * tell the player anything.
 */
export function readImageX(dxImage: number, axis: BodyAxis, split: ImageXSplit): AxisReading {
  const a = axis === 'depth' ? split.depth : split.lateral
  if (!a.readable || !Number.isFinite(dxImage)) return { value: null, confidence: 0 }

  return {
    value: dxImage / a.gain,
    // Rounded to two places to match `Spatial.confidence`, which is the other
    // factor in it — an unrounded product of a rounded number is false detail.
    confidence: Math.round(a.share * split.spatial_confidence * 100) / 100,
  }
}
