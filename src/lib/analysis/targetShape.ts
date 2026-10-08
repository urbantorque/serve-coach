/**
 * The target, drawn as a body instead of printed as a number.
 *
 * The report already says everything it knows. "Hip–shoulder separation 28°,
 * aim for hips lead the chest" is a complete, honest sentence and it is useless
 * to the person it is written for: a club player can read 28 and cannot picture
 * 40, so the one thing on the card they are supposed to act on is the one thing
 * they cannot see. What replaced the number on the keyframe still was an arc
 * dial — a 180° sweep with the band shaded and the reading marked — and that is
 * a better chart than a decimal and still not a body. Nobody has ever felt an
 * arc.
 *
 * So this turns a measurement into a small figure: the joint, the two limbs
 * either side of it, at the angle that was measured. Draw it twice, once at what
 * the player did and once at the middle of the band, and the correction stops
 * being arithmetic. Two shoulder lines. One theirs, one where it should be.
 *
 * WHAT THIS IS NOT, and the caveat is the whole reason it is allowed to exist.
 * It is not the player's body, it is not footage, and it is not a pro. It is a
 * diagram of a number, in the same sense the arc dial it replaces was a diagram
 * of a number — `drawDial` puts it best: "a chart, and a chart claims nothing
 * about the pixels behind it". Every caller labels it as the target shape and
 * nothing may ever caption it as what anybody's real serve looks like. A stick
 * figure driven by the report's own bands, dressed up as a photograph, is
 * exactly the confident nonsense this app is arranged against.
 *
 * ONE RULE, inherited unchanged from `ghostFor` in `pose/skeleton.ts`: the
 * picture is built from the number the card prints and re-measures back to it.
 * `remeasure` below runs the app's OWN measurement over the drawn landmarks —
 * `jointAngle`, `signedElevationFromHorizontal`, `groundYaw` and `wrapHalfTurn`
 * straight out of `geometry.ts`, never a second copy of the arithmetic written
 * next to the drawing — and has to return the value the figure was built from.
 * `__tests__/targetShape.test.ts` asserts that for every metric here across its
 * whole range. A picture that disagrees with its own caption is worse than no
 * picture: the player reads one claim, looks at another, and rightly stops
 * believing both.
 *
 * WHAT MAKES THIS POSSIBLE WHERE THE GHOST COULD NOT. `ghostFor` refuses knee
 * bend, shoulder tilt and hip–shoulder separation, and its refusal is correct
 * for what it is doing: it slides the player's own tracked body along image y,
 * a translation changes no angle anywhere, and there is no image-space
 * construction that would re-measure to a world angle. That is a limit of
 * moving a real body inside a real photograph. It is not a limit on drawing.
 *
 * Every one of those three angles lives in a plane, and it is a different plane
 * each time:
 *
 *   - `kneeBend` is `jointAngle` of three world points, which is planar by
 *     construction — three points determine a plane and the angle is measured
 *     in it.
 *   - `shoulderTilt` is `signedElevationFromHorizontal`, an `asin` of a height
 *     over a length: the vertical plane containing the shoulder line.
 *   - `hipShoulderSeparation` is a difference of two `groundYaw` bearings, and
 *     `groundYaw` is `atan2(dz, dx)` — the ground plane, seen from directly
 *     above.
 *
 * Draw each in its own plane and the drawn angle IS the measured angle, with no
 * projection in between to foreshorten it. That is why every figure below
 * carries the view it is drawn from as a string the player reads, and why the
 * plan view of the coil is captioned "looking down". A diagram whose viewpoint
 * is not stated is a diagram inviting the reader to assume it is the camera's.
 */
import type { Landmark } from './types'
import {
  groundYaw,
  jointAngle,
  signedElevationFromHorizontal,
  wrapHalfTurn,
} from './geometry'

export interface Pt {
  x: number
  y: number
}

/**
 * Which kind of quantity a figure draws, and therefore how a caller shows a
 * band across it.
 *
 * An angle band is two more figures — the shape at each edge — and there is
 * nothing sensible to shade between them. A height band is a strip of the
 * picture, because the picture has an absolute vertical scale in it: the court
 * at the bottom and the player's own standing height as the unit.
 */
export type ShapeKind = 'angle' | 'height'

/** A figure, in its own plane, with y pointing DOWN as everywhere else here. */
export interface Figure {
  /**
   * The measured part, and only the measured part. Every point in here moves
   * when the value moves, so all of it is a claim about the number.
   */
  lines: Pt[][]
  /** The joints the reading is taken at — dotted, so it is obvious where it came from. */
  joints: Pt[]
  /**
   * Geometry that is identical whatever the value is.
   *
   * A head and a trunk on the tilt diagram, the standing body on a height
   * diagram, the dotted horizontal the tilt is measured against. These make the
   * figure readable as a body rather than as two sticks, and they are separated
   * from `lines` precisely so they cannot smuggle in a second claim: drawn the
   * same in the player's figure and in the target's, the difference between the
   * two pictures is exactly the difference between the two numbers and nothing
   * else. The caller draws them once, in the neutral ink, not twice.
   */
  reference: Pt[][]
  /** A head, where one belongs. Reference geometry — it never moves with the value. */
  head?: { c: Pt; r: number }
  /** Where a "you" or "target" tag hangs, so the two figures can be told apart. */
  focus: Pt
  /**
   * The landmarks the app's own measurement is taken from, in the world space
   * it takes them in.
   *
   * Carried rather than recovered from `lines`, because the two are not the
   * same space for the plan view — there the drawing's vertical axis is world z
   * — and a reader of `remeasure` should not have to hold that in their head.
   */
  probe: Landmark[]
}

/** How a figure is to be read, in the words shown under it. */
export interface ShapeView {
  kind: ShapeKind
  /** The viewpoint, said out loud. Never omitted — see the header. */
  view: string
  /** What the two ends of the drawn part are, so the sticks read as a body. */
  ends: [string, string]
}

const rad = (deg: number) => (deg * Math.PI) / 180
const DEG = 180 / Math.PI

const lm = (x: number, y: number, z: number): Landmark => ({ x, y, z, visibility: 1 })

/* ---------------------------------------------------------------- proportions
 *
 * Everything is a fraction of standing height, which is the unit the whole
 * pipeline already works in, so a figure drawn here and a ratio measured off
 * real footage are on one scale. The numbers are ordinary adult proportions —
 * thigh and shin each about a quarter of standing height, shoulder span a little
 * under a quarter, upper arm and forearm a sixth. They decide only how the
 * diagram looks; not one measurement below depends on them, because every angle
 * here is built from directions and an angle between two directions does not
 * care how long they are.
 */
const THIGH = 0.245
const SHIN = 0.245
const UPPER_ARM = 0.17
const FOREARM = 0.16
const SHOULDER_SPAN = 0.23
const HIP_SPAN = 0.17

/* ------------------------------------------------------------------ the specs */

interface JointSpec {
  kind: 'joint'
  view: string
  ends: [string, string]
  /**
   * Whether the number IS the angle at the joint, or how far the joint is bent
   * away from straight.
   *
   * `kneeBend` is stored as `180 - jointAngle` — `metrics.ts` computes it that
   * way so that a deep load reads as a big number — and a figure built as
   * though 50 meant a 50° angle at the knee would draw a squat as very nearly a
   * straight leg. The two conventions differ by the entire range of the
   * measurement, which is the kind of inversion that looks fine until somebody
   * checks it, so it is stated per metric rather than inferred from the name.
   */
  fromStraight: boolean
  /** Limb lengths either side of the joint, in standing heights. */
  limbs: [number, number]
  /**
   * Which way the wedge opens, in drawing degrees — 0 is to the right and 90 is
   * DOWN, because y points down here as it does in every image space in this
   * app.
   *
   * Chosen per metric so the figure lands in the posture the measurement is
   * taken at: a loaded knee pushes forward over the toes, a racket drop hangs
   * the hand below a raised elbow, a contact arm reaches overhead. It moves the
   * whole figure rigidly and cannot change the angle between the limbs, which
   * is the only thing measured — so it is styling, and it is the one thing in
   * this file that is.
   */
  bisector: number
  /** Which limb sits on which side of the bisector. Also styling; see above. */
  sign: 1 | -1
}

interface TiltSpec {
  kind: 'tilt'
  view: string
  ends: [string, string]
}

interface CoilSpec {
  kind: 'coil'
  view: string
  ends: [string, string]
}

interface HeightSpec {
  kind: 'height'
  view: string
  ends: [string, string]
  /** Whether the thing at that height is a ball rather than a hand. */
  marker: 'hand' | 'ball'
}

type ShapeSpec = JointSpec | TiltSpec | CoilSpec | HeightSpec

/**
 * Every measurement this file can draw, and — by omission — every one it cannot.
 *
 * Absent is the safe answer and the common one. Twenty-odd measurements reach
 * the report and eight are here. The tossing arm left with its band (D2.1): a
 * figure is drawn against a target, and a reading has none. The rest are
 * timings, shares of a window, and drifts along a body axis, none of which is a
 * posture and all of which would have to be drawn as some invented pictogram. A measurement gets a figure when
 * the figure is the measurement seen from the right side, and never because a
 * card looked bare without one.
 */
const SHAPES: Record<string, ShapeSpec> = {
  /* ------------------------------------------------------------------- toss */
  releaseHeight: {
    kind: 'height',
    view: 'Where the ball leaves your hand, against your own height',
    ends: ['court', 'hand'],
    marker: 'hand',
  },
  tossPeakHeight: {
    kind: 'height',
    view: 'How high the toss climbs, against your own height',
    ends: ['court', 'ball'],
    marker: 'ball',
  },

  /* ---------------------------------------------------------------- loading */
  kneeBend: {
    kind: 'joint',
    view: 'Your leg at the trophy, from the side',
    ends: ['hip', 'ankle'],
    fromStraight: true,
    limbs: [THIGH, SHIN],
    // Opening to the left, so the knee itself is the rightmost point — a loaded
    // knee travels forward over the toes, and a diagram with it poking out
    // backwards would be a picture of somebody falling over.
    bisector: 180,
    sign: -1,
  },
  hipShoulderSeparation: {
    kind: 'coil',
    // The one figure in here that is not a view anybody films from, which is
    // exactly why the caption says so. `groundYaw` is `atan2(dz, dx)`: the
    // number is a bearing in the ground plane, so the plane it is honest in is
    // the one seen from directly overhead.
    view: 'Looking down on your hips and chest from above',
    ends: ['hips', 'chest'],
  },
  shoulderTilt: {
    kind: 'tilt',
    view: 'Your shoulders, seen down the line of them',
    ends: ['tossing shoulder', 'hitting shoulder'],
  },

  /* ------------------------------------------------------------------ swing */
  elbowAtDrop: {
    kind: 'joint',
    view: 'Your hitting arm at the racket drop, from the side',
    ends: ['shoulder', 'hand'],
    fromStraight: false,
    limbs: [UPPER_ARM, FOREARM],
    // Opening downwards: at the bottom of the drop the elbow is the high point
    // and the hand hangs below it, down the back.
    bisector: 90,
    sign: 1,
  },

  /* ---------------------------------------------------------------- contact */
  contactHeight: {
    kind: 'height',
    view: 'Where you meet the ball, against your own height',
    ends: ['court', 'contact'],
    marker: 'hand',
  },
  armExtension: {
    kind: 'joint',
    view: 'Your hitting arm at contact, from the side',
    ends: ['shoulder', 'hand'],
    fromStraight: false,
    limbs: [UPPER_ARM, FOREARM],
    bisector: 0,
    sign: -1,
  },
}

/** Measurements a figure can be drawn for. Used by the tests and the copy lint. */
export const DRAWN = Object.keys(SHAPES)

/** How to read the figure for a measurement, or nothing if it has none. */
export function viewOf(id: string): ShapeView | undefined {
  const spec = SHAPES[id]
  if (!spec) return undefined
  return {
    kind: spec.kind === 'height' ? 'height' : 'angle',
    view: spec.view,
    ends: spec.ends,
  }
}

/**
 * The figure for one measurement at one value, or nothing.
 *
 * Nothing for a measurement with no shape, and nothing for a value that is not
 * a number — never a figure at a defaulted value. `metrics.ts` drops a
 * measurement it could not take rather than flooring it, and a drawing invented
 * at the bottom of a band would undo that in the most persuasive medium the app
 * has.
 */
export function figureOf(id: string, value: number): Figure | undefined {
  const spec = SHAPES[id]
  if (!spec || !Number.isFinite(value)) return undefined
  switch (spec.kind) {
    case 'joint':
      return jointFigure(spec, value)
    case 'tilt':
      return tiltFigure(value)
    case 'coil':
      return coilFigure(value)
    case 'height':
      // Nothing off the spec is needed to build it: the standing body is the
      // same yardstick whatever is being measured against it, and the one thing
      // that differs — a ball rather than a hand at the mark — is a question for
      // the renderer, which asks `markerOf`.
      return heightFigure(value)
  }
}

/**
 * The app's own measurement, run over a figure's landmarks.
 *
 * The proof that a picture and its caption agree, and the reason it is written
 * here rather than in the test file: a test holding its own copy of the
 * arithmetic proves the copy, not the drawing. Every branch calls the same
 * function `metrics.ts` calls for that measurement — this is deliberately a
 * lookup table of the engine's formulas, not a reimplementation of them.
 */
export function remeasure(id: string, fig: Figure): number {
  const spec = SHAPES[id]
  if (!spec) return NaN
  const p = fig.probe
  switch (spec.kind) {
    case 'joint': {
      const deg = jointAngle(p[0], p[1], p[2])
      return spec.fromStraight ? 180 - deg : deg
    }
    case 'tilt':
      // Tossing shoulder first, hitting shoulder second — the order `measure`
      // uses, and the order that makes a positive reading the cartwheel the
      // report asks for rather than its mirror image.
      return signedElevationFromHorizontal(p[0], p[1])
    case 'coil':
      // Shoulders against hips, wrapped to the angle between two LINES. Exactly
      // `trunkCoilReading`'s final step, minus the unwinding direction, which a
      // still figure has nothing to say about — see `coilFigure`.
      return wrapHalfTurn((groundYaw(p[2], p[3]) - groundYaw(p[0], p[1])) * DEG)
    case 'height':
      // `(groundY - landmark.y) / bodyHeight`, with the court at zero and
      // standing height at one, which is what `heightFigure` builds.
      return -p[0].y
  }
}

/* ------------------------------------------------------------------ builders */

/**
 * Two limbs meeting at a joint, at the angle that was measured.
 *
 * The joint sits at the origin and both limbs are placed by direction, so the
 * angle between them is the requested one to machine precision rather than to
 * whatever a trigonometric round trip leaves behind. The whole figure is then a
 * rigid rotation away from any other orientation, which is what `bisector` and
 * `sign` choose — and a rigid rotation cannot touch an angle, so the styling
 * and the measurement are provably independent.
 */
function jointFigure(spec: JointSpec, value: number): Figure {
  // Clamped to what a joint can do. A measurement outside 0–180 is not a joint
  // angle, and drawing one would fold a limb through itself rather than admit
  // the number was impossible.
  const angle = Math.max(0, Math.min(180, spec.fromStraight ? 180 - value : value))
  const half = rad(angle / 2)
  const mid = rad(spec.bisector)
  const dirA = mid - spec.sign * half
  const dirC = mid + spec.sign * half

  const b = { x: 0, y: 0 }
  const a = { x: Math.cos(dirA) * spec.limbs[0], y: Math.sin(dirA) * spec.limbs[0] }
  const c = { x: Math.cos(dirC) * spec.limbs[1], y: Math.sin(dirC) * spec.limbs[1] }

  return {
    lines: [[a, b], [b, c]],
    joints: [a, b, c],
    reference: [],
    focus: b,
    // The drawing plane is world x–y with z flat, which is the plane
    // `jointAngle` would measure these three points in anyway — three points
    // determine a plane and the angle lives in it, so there is no projection
    // here to lose anything.
    probe: [lm(a.x, a.y, 0), lm(b.x, b.y, 0), lm(c.x, c.y, 0)],
  }
}

/**
 * The shoulder line, tilted out of horizontal by the measured angle.
 *
 * `signedElevationFromHorizontal` is `asin(dy / length)`, so a line of length L
 * whose ends differ by `L·sin(t)` in height measures back as exactly `t`. Both
 * ends are placed off the midpoint at ±L/2, which keeps the figure centred as
 * the tilt changes — a line pivoting about one end would slide across the box
 * and read as the player moving rather than tilting.
 *
 * The dotted horizontal through the midpoint is the reference the angle is
 * measured against, and it is the reason this diagram works at all: an isolated
 * tilted line has no angle in it, it is just a line. The head and trunk are
 * there so the pair of shoulders reads as a pair of shoulders. All three are
 * fixed geometry and are drawn once for both figures.
 */
function tiltFigure(value: number): Figure {
  const t = rad(Math.max(-89, Math.min(89, value)))
  const half = SHOULDER_SPAN / 2
  const toss = { x: -half * Math.cos(t), y: -half * Math.sin(t) }
  const hit = { x: half * Math.cos(t), y: half * Math.sin(t) }

  return {
    lines: [[toss, hit]],
    joints: [toss, hit],
    reference: [
      // The horizontal, a little wider than the shoulders so the wedge between
      // the two is visible at the ends where it is largest.
      [{ x: -half * 1.25, y: 0 }, { x: half * 1.25, y: 0 }],
      // Trunk, straight down from between the shoulders. Vertical on purpose:
      // nothing here measures the spine, and a trunk drawn leaning would be a
      // second claim riding along with the first.
      [{ x: 0, y: 0 }, { x: 0, y: SHOULDER_SPAN * 0.95 }],
    ],
    head: { c: { x: 0, y: -SHOULDER_SPAN * 0.52 }, r: SHOULDER_SPAN * 0.3 },
    focus: hit,
    // World y is down here too, which is what makes the drawing and the
    // measurement the same picture: `signedElevationFromHorizontal` is written
    // against MediaPipe's +y-down convention and says so.
    probe: [lm(toss.x, toss.y, 0), lm(hit.x, hit.y, 0)],
  }
}

/**
 * The hips and the chest as two bars, seen from directly above.
 *
 * The hip line is held fixed and the chest line carries the whole angle. That is
 * not a claim that the hips point at anything in particular — the measurement is
 * the angle BETWEEN two lines and has no third line to state either of them
 * against — it is the only way to draw a difference of two bearings without
 * inventing a court to put them on. Holding one still and turning the other is
 * the difference itself, which is all there is.
 *
 * WHAT THIS DIAGRAM DOES NOT SHOW, and it is the honest half. `trunkCoilReading`
 * signs the reading by which way the shoulders sweep between the trophy and
 * contact — `deg = opening > 0 ? -lag : lag` — so the sign is a fact about a
 * rotation happening over time, and a still picture has no time in it. What the
 * sign means is still drawn correctly, because it is drawn as itself: a positive
 * value turns the chest one way and a negative value turns it the other, and the
 * card's own readout beside it names which fault that is ("hips lead the chest"
 * against "chest opens ahead of the hips"). The figure shows the shape; the
 * words say which of the two shapes it is.
 */
function coilFigure(value: number): Figure {
  const t = rad(Math.max(-89, Math.min(89, value)))
  const h = HIP_SPAN / 2
  const s = SHOULDER_SPAN / 2

  // Drawing y is world z — the axis running away from the viewer when looking
  // straight down. There is no world y in this figure at all, which is what
  // "from above" means.
  const hipL = { x: -h, y: 0 }
  const hipR = { x: h, y: 0 }
  const shL = { x: -s * Math.cos(t), y: -s * Math.sin(t) }
  const shR = { x: s * Math.cos(t), y: s * Math.sin(t) }

  return {
    lines: [[shL, shR]],
    joints: [shL, shR],
    reference: [[hipL, hipR]],
    head: { c: { x: 0, y: 0 }, r: HIP_SPAN * 0.34 },
    focus: shR,
    probe: [
      lm(hipL.x, 0, hipL.y),
      lm(hipR.x, 0, hipR.y),
      lm(shL.x, 0, shL.y),
      lm(shR.x, 0, shR.y),
    ],
  }
}

/**
 * A standing figure with the court under it, and a mark at the measured height.
 *
 * The body here is a yardstick and nothing else. It is identical at every value,
 * it is in `reference` so a caller draws it once for both figures, and it is
 * standing flat on the court with its feet down — which is the point. The
 * measurement is `(groundY - landmark.y) / bodyHeight`, a height in the picture
 * over a height in the picture, so a figure exactly one unit tall standing on
 * zero turns the ratio into a place on the drawing that a person can look at.
 *
 * NO ARM REACHES UP TO THE MARK, and that is the same refusal `GHOST_BONES`
 * makes for the same reason. Contact happens well above what a standing player
 * can touch — the band tops out at 1.5 standing heights against an arm that
 * reaches about 1.25 — so an arm drawn from this figure's shoulder to the mark
 * would either have to stretch or lift the feet off the court, and feet in the
 * air are a claim about leg drive that the report already scores on its own card
 * with its own band. The mark is a mark. The height is the whole measurement and
 * the height is all this draws.
 */
function heightFigure(value: number): Figure {
  const y = -Math.max(0, value)
  const mark: Pt = { x: 0.34, y }

  return {
    // The mark, and a rule out to it across the picture so it can be read
    // against the body without anyone sighting along it.
    lines: [[{ x: -0.34, y }, mark]],
    joints: [mark],
    reference: [
      // The court.
      [{ x: -0.42, y: 0 }, { x: 0.42, y: 0 }],
      // Trunk, arms by the sides, legs. A plain standing body — see above.
      [{ x: 0, y: -0.82 }, { x: 0, y: -0.53 }],
      [{ x: -SHOULDER_SPAN / 2, y: -0.82 }, { x: SHOULDER_SPAN / 2, y: -0.82 }],
      [{ x: -SHOULDER_SPAN / 2, y: -0.82 }, { x: -0.14, y: -0.55 }],
      [{ x: SHOULDER_SPAN / 2, y: -0.82 }, { x: 0.14, y: -0.55 }],
      [{ x: -HIP_SPAN / 2, y: -0.53 }, { x: HIP_SPAN / 2, y: -0.53 }],
      [{ x: -HIP_SPAN / 2, y: -0.53 }, { x: -0.07, y: -0.27 }, { x: -0.07, y: 0 }],
      [{ x: HIP_SPAN / 2, y: -0.53 }, { x: 0.07, y: -0.27 }, { x: 0.07, y: 0 }],
    ],
    head: { c: { x: 0, y: -0.93 }, r: 0.07 },
    focus: mark,
    probe: [lm(mark.x, y, 0)],
  }
}

/** Whether a figure's mark is a ball rather than a hand — the renderer's cue. */
export function markerOf(id: string): 'hand' | 'ball' | undefined {
  const spec = SHAPES[id]
  return spec && spec.kind === 'height' ? spec.marker : undefined
}

/**
 * A figure's polylines as an SVG path, rounded so the angle survives.
 *
 * Here rather than in the renderer, because the rounding is part of the ONE RULE
 * and has to be testable without a browser. It broke exactly once and the shape
 * of the break is worth keeping: coordinates used to be scaled into a 168-unit
 * box before they were written out, two decimal places was well under a device
 * pixel there, and when the box became the figure's own bounding box — units of
 * about half a standing height — the same two places became a quantisation of a
 * quarter of the figure. A 23° shoulder tilt came out of the markup measuring
 * 20°, under a caption that still said 23. Nothing threw, nothing looked wrong,
 * and the picture and its caption had quietly stopped agreeing.
 *
 * SIGNIFICANT digits, not decimal places, which is the property that was
 * missing: six of them are the same precision whatever the figure's units are,
 * so this cannot be broken again by rescaling the drawing.
 */
export function pathOf(lines: Pt[][]): string {
  const n = (v: number) => Number(v.toPrecision(6))
  return lines
    .map((line) => line.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join(' '))
    .join(' ')
}

/**
 * The landmarks back out of a path built by `pathOf`, for the tests.
 *
 * The only way to check the rounding above without a browser: build a figure,
 * write it out as markup, read the markup, and re-measure. Anything that agrees
 * with the figure but not with its markup is a picture that disagrees with its
 * caption on screen and nowhere else.
 */
export function pointsIn(path: string): Pt[] {
  return path
    .trim()
    .split(/(?=[ML])/)
    .map((token) => token.slice(1).trim().split(/\s+/).map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite))
    .map(([x, y]) => ({ x, y }))
}

/**
 * The box every figure for one measurement must share.
 *
 * Fitted across ALL of them at once — the player's, the target's and both band
 * edges — rather than per figure, and that is the only reason the pair can be
 * read against each other. Scaled independently, a 20° coil and a 40° coil are
 * two pictures of a wide angle and the difference vanishes; scaled together, one
 * is visibly half the other, which is the entire point of drawing them.
 */
export function boundsOf(figures: Figure[]): { min: Pt; max: Pt } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const see = (p: Pt) => {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  for (const f of figures) {
    for (const line of [...f.lines, ...f.reference]) for (const p of line) see(p)
    for (const p of f.joints) see(p)
    if (f.head) {
      see({ x: f.head.c.x - f.head.r, y: f.head.c.y - f.head.r })
      see({ x: f.head.c.x + f.head.r, y: f.head.c.y + f.head.r })
    }
  }
  if (!Number.isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}
