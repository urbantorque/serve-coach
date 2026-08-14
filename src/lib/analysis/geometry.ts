import type { Frame, Landmark, Status } from './types'

/** MediaPipe BlazePose landmark indices, named so the maths below reads. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
} as const

export type Side = 'left' | 'right'

export const sided = (side: Side) => ({
  shoulder: side === 'left' ? LM.leftShoulder : LM.rightShoulder,
  elbow: side === 'left' ? LM.leftElbow : LM.rightElbow,
  wrist: side === 'left' ? LM.leftWrist : LM.rightWrist,
  hip: side === 'left' ? LM.leftHip : LM.rightHip,
  knee: side === 'left' ? LM.leftKnee : LM.rightKnee,
  ankle: side === 'left' ? LM.leftAnkle : LM.rightAnkle,
})

export const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')

/* --------------------------------------------------------------- scalar math */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function mean(xs: number[]): number {
  if (!xs.length) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/* ------------------------------------------------------------------- vectors */

export const midpoint = (a: Landmark, b: Landmark): Landmark => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
  visibility: Math.min(a.visibility, b.visibility),
})

export const dist2d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

export const dist3d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/**
 * Interior angle at `b` in degrees. Feed this world landmarks — a 3D angle is
 * the same whether the camera is side-on or behind, which an image-plane angle
 * emphatically is not.
 */
export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }
  const n1 = Math.hypot(v1.x, v1.y, v1.z)
  const n2 = Math.hypot(v2.x, v2.y, v2.z)
  if (n1 < 1e-6 || n2 < 1e-6) return 180
  const cos = clamp((v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (n1 * n2), -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

const DEG = 180 / Math.PI

/**
 * Bearing of a directed segment in the ground plane, radians about world up.
 *
 * Exported for `targetShape.ts`, which draws the coil as a plan view and then
 * has to prove the picture measures back to the number printed under it. That
 * proof is only worth anything if it runs through this function rather than
 * through a second copy of `atan2` written next to the drawing — two copies of a
 * bearing is exactly how a diagram and a caption end up disagreeing about which
 * way somebody turned.
 */
export const groundYaw = (a: Landmark, b: Landmark) => Math.atan2(b.z - a.z, b.x - a.x)

/**
 * Wrap to (-90, 90]: the angle between two *lines*.
 *
 * A shoulder line 170° from a hip line is the same posture as one 10° from it
 * with the ends named the other way round. Reporting the raw difference would
 * turn a small coil into an enormous one whenever the tracker swapped which
 * shoulder it thought was which.
 */
export function wrapHalfTurn(deg: number): number {
  return ((((deg % 180) + 270) % 180) - 90)
}

/**
 * How far a segment tilts out of the horizontal plane, in degrees, signed by
 * which end of it hangs lower: positive when `low` sits below `high`.
 *
 * World +y points down, so "lower" is the larger y — which is why this cannot be
 * written as the difference of two heights without the reader stopping to work
 * out which way is up.
 *
 * Must be given world landmarks. Measuring this in the image plane looks
 * tempting but breaks badly side-on: the shoulder line then points nearly at
 * the camera, its horizontal component collapses to almost nothing, and a
 * modest 20° tilt projects as 60°+.
 */
export function signedElevationFromHorizontal(high: Landmark, low: Landmark): number {
  const dy = low.y - high.y
  const len = dist3d(high, low)
  if (len < 1e-6) return 0
  return (Math.asin(clamp(dy / len, -1, 1)) * 180) / Math.PI
}

/* -------------------------------------------------------------------- series */

/**
 * Centred moving average. Pose output is jittery frame to frame; every series
 * we take an extremum of gets smoothed first or the keyframes land on noise.
 */
export function smooth(xs: number[], radius = 2): number[] {
  if (radius < 1 || xs.length < 3) return [...xs]
  const out = new Array<number>(xs.length)
  for (let i = 0; i < xs.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(xs.length - 1, i + radius); j++) {
      sum += xs[j]
      n++
    }
    out[i] = sum / n
  }
  return out
}

/** Central-difference derivative, in units per second. */
export function derivative(xs: number[], ts: number[]): number[] {
  const out = new Array<number>(xs.length).fill(0)
  for (let i = 1; i < xs.length - 1; i++) {
    const dt = ts[i + 1] - ts[i - 1]
    out[i] = dt > 1e-6 ? (xs[i + 1] - xs[i - 1]) / dt : 0
  }
  if (xs.length > 1) {
    out[0] = out[1] ?? 0
    out[xs.length - 1] = out[xs.length - 2] ?? 0
  }
  return out
}

export function argMinIn(xs: number[], from: number, to: number): number {
  const lo = clamp(Math.min(from, to), 0, xs.length - 1)
  const hi = clamp(Math.max(from, to), 0, xs.length - 1)
  let best = lo
  for (let i = lo; i <= hi; i++) if (xs[i] < xs[best]) best = i
  return best
}

export function argMaxIn(xs: number[], from: number, to: number): number {
  const lo = clamp(Math.min(from, to), 0, xs.length - 1)
  const hi = clamp(Math.max(from, to), 0, xs.length - 1)
  let best = lo
  for (let i = lo; i <= hi; i++) if (xs[i] > xs[best]) best = i
  return best
}

/* ------------------------------------------------------------------- scoring */

/**
 * Map a measurement onto 0–100.
 *
 * The curve is built so that the band and the badge cannot disagree. Two
 * invariants hold by construction, with nothing downstream having to clamp or
 * correct them:
 *
 *   · a value inside its band is never worse than "Solid";
 *   · a value outside its band is never "Solid" or better.
 *
 * That is the whole reason for the shape below. Band membership is what the
 * readout, the fix and the drill all key off — a card cannot both congratulate a
 * player and describe their fault — so the score has to cross the "Solid"
 * threshold at exactly the same place the band does. An earlier curve put the
 * whole band in 90–100 and its near misses at 88, which meant a measurement
 * nine degrees under its band came back badged "Solid" with a readout naming the
 * fault; capping the badge afterwards fixed the contradiction and created a
 * worse one, since in-band was then always "Strong", out-of-band always at best
 * "Refine", and "Solid" unreachable for every measurement in the app.
 *
 * So: the band edge scores `SOLID_SCORE` exactly, the best point in the band
 * scores 100, and outside the band the score starts a hair below the edge and
 * decays to `SCORE_FLOOR`. A value just inside its band is "Solid", the middle
 * of the band is "Strong", a near miss is "Refine" and a large miss is "Work on
 * this" — four badges, continuous at every edge, no cliff.
 *
 * Where the best value sits inside the band depends on the band's shape. A
 * band bounded on both sides (knee bend, contact height) is best in the
 * middle — too much is as wrong as too little. A band running to the edge of
 * the axis is one-directional: for toss wobble, zero is perfect, and for arm
 * extension, straighter is always better. Scoring those by centredness would
 * mark a flawless toss down for not wobbling enough, and would put its 100 in a
 * place the player cannot reach.
 *
 * The decay outside the band is gentler than it first was and bottoms out well
 * above zero. These bands describe a *well-struck* serve, so a recreational
 * player misses several of them at once by construction; with a steep decay onto
 * a near-zero floor that produced whole areas in the twenties, which reads as a
 * verdict on the person rather than a reading of the serve. Nobody films their
 * serve a second time after being told it scores 25. What the shape has to
 * preserve is the ordering — a real fault still lands clearly below its
 * neighbours and clearly inside "work on this" — so the floor is lifted, not
 * flattened.
 */

/**
 * The worst a single measurement can score.
 *
 * Not zero, and not near it. Zero says "this did not happen", and a player whose
 * racket never falls behind their back is still serving — the number has to read
 * as the thing to work on rather than as an insult.
 */
const SCORE_FLOOR = 30

/**
 * The badge thresholds, named because the curve above is built to land on them.
 *
 * `SOLID_SCORE` is load-bearing twice over: `statusOf` promotes to "Solid" at
 * it, and `scoreAgainst` scores a band edge at exactly it. Written as two
 * separate literals they would drift apart on the next recalibration and take
 * the band/badge agreement with them, which is precisely the bug this curve
 * exists to make impossible.
 */
const STRONG_SCORE = 85
const SOLID_SCORE = 70
const REFINE_SCORE = 55

/**
 * The best a measurement outside its band can reach: one point under the edge.
 *
 * One point rather than ten, so the boundary is continuous — stepping a
 * hair outside the band costs a badge, not twenty points. It still sits below
 * `SOLID_SCORE`, which is what makes "outside the band is never Solid" true by
 * arithmetic rather than by a cap.
 */
const SCORE_NEAR_MISS = SOLID_SCORE - 1

/**
 * Score a measurement against its band.
 *
 * `missSpan` overrides the axis length the decay outside the band is measured
 * against. It exists for the signed measurements. A signed axis is a mirror —
 * the negative half is the same physical quantity pointing the other way — so
 * admitting it doubles the apparent axis and, through `tolerance` below, halves
 * how hard every miss is punished on a measurement whose bands did not move.
 * Widening `shoulderTilt` from 0–50 to -25–50 without this lifted a
 * flat-shouldered trophy from 45 to 58, which is the difference between "work on
 * this" and "fair" bought purely by adding a region the player was not in.
 */
export function scoreAgainst(
  value: number,
  ideal: [number, number],
  range: [number, number],
  missSpan?: number,
): number {
  const [lo, hi] = ideal
  const span = Math.abs(missSpan ?? (range[1] - range[0])) || 1

  if (value >= lo && value <= hi) {
    const width = hi - lo
    if (width <= 1e-6) return 100
    const openLow = lo <= range[0] + 1e-9
    const openHigh = hi >= range[1] - 1e-9
    let quality: number
    if (openLow && !openHigh) quality = 1 - (value - lo) / width
    else if (openHigh && !openLow) quality = (value - lo) / width
    else quality = 1 - Math.abs(value - (lo + hi) / 2) / (width / 2)
    // Edge to `SOLID_SCORE`, best point to 100. Scoring the whole band 90–100
    // is what made every in-band measurement "Strong" and left "Solid" with
    // nothing to describe; a player sitting on the lip of the band has met the
    // standard, which is what "Solid" means, and has not mastered it.
    return Math.round(SOLID_SCORE + (100 - SOLID_SCORE) * clamp(quality, 0, 1))
  }

  // How far outside the band counts as a total miss, proportional to the axis so
  // a measurement in degrees and one in body-heights fall off at comparable
  // rates. The exponent stays just above linear: a near miss should cost real
  // points, a large miss should not cost proportionally more once the fault is
  // already obvious and named.
  const d = value < lo ? lo - value : value - hi
  const tolerance = span * 0.4
  const decay = Math.max(0, 1 - d / tolerance) ** 1.15
  return Math.round(
    clamp(SCORE_FLOOR + (SCORE_NEAR_MISS - SCORE_FLOOR) * decay, SCORE_FLOOR, SCORE_NEAR_MISS),
  )
}

export function statusOf(score: number): Status {
  if (score >= STRONG_SCORE) return 'great'
  if (score >= SOLID_SCORE) return 'good'
  if (score >= REFINE_SCORE) return 'fair'
  return 'work'
}

export function weightedScore(items: { score: number; weight: number }[]): number {
  const total = items.reduce((s, i) => s + i.weight, 0)
  if (!total) return 0
  return Math.round(items.reduce((s, i) => s + i.score * i.weight, 0) / total)
}

/**
 * How much of an area's score the weakest measurement in it is allowed to own.
 *
 * A serve is a chain. Contact height at 38 next to three excellent contact
 * measurements is not a "solid" contact — it is a serve being hit below full
 * reach, and averaging it against its neighbours produced a card badged Solid
 * whose own headline named the thing wrong with it. Consistency scoring already
 * had to solve this (see `buildConsistency`, which leans 60% on its worst two);
 * areas need it for the same reason and get a gentler version, because an area
 * is three or four related measurements rather than seventeen unrelated ones.
 */
const WEAKEST_LINK_SHARE = 0.3

/**
 * Score an area from its measurements, letting the weakest one pull the result
 * down rather than being averaged away.
 *
 * `eligible` is which measurements are allowed to *be* the weakest link. A
 * number the app has already admitted it cannot see clearly must not be handed
 * this much of the score — that would turn a framing problem into a verdict on
 * the player's technique. It still counts towards the mean, at reduced weight.
 */
export function chainScore(
  items: { score: number; weight: number }[],
  eligible: { score: number }[] = items,
): number {
  if (!items.length) return 0
  const mean = weightedScore(items)
  const pool = eligible.length ? eligible : items
  const worst = Math.min(...pool.map((i) => i.score))
  return Math.round(mean * (1 - WEAKEST_LINK_SHARE) + worst * WEAKEST_LINK_SHARE)
}

/* --------------------------------------------------------------- frame utils */

/**
 * Where a world landmark was at a keyframe, averaged over a frame or two either
 * side.
 *
 * Pose output jitters, and anything read from a single frame inherits all of it.
 * Position noise is symmetric, so it cancels under an average — which is the
 * cheapest accuracy in the pipeline and the reason nothing measured at a
 * keyframe should be reading `frames[i].world[lm]` directly.
 *
 * Every keyframe this is used at is an extremum of its own motion — deepest knee
 * bend, fullest reach, the trophy the player sits in — where the quantity being
 * measured is locally flat. That is what makes the window free: a couple of
 * frames either side of a broad extremum costs no real accuracy, and buys back
 * several degrees on the measurements built out of world z.
 */
export function steadyWorld(
  frames: Frame[],
  index: number,
  landmark: number,
  radius = 1,
): Landmark {
  const lo = Math.max(0, index - radius)
  const hi = Math.min(frames.length - 1, index + radius)
  let x = 0
  let y = 0
  let z = 0
  for (let i = lo; i <= hi; i++) {
    const p = frames[i].world[landmark]
    x += p.x
    y += p.y
    z += p.z
  }
  const n = Math.max(1, hi - lo + 1)
  return { x: x / n, y: y / n, z: z / n, visibility: 1 }
}

/**
 * Frames either side of the trophy the trunk landmarks are averaged over.
 *
 * Wider than the ±1 the joint angles use, because hip–shoulder separation and
 * shoulder tilt are the two noisiest numbers in the app: both are built almost
 * entirely out of world z, which is the least reliable thing the pose model
 * outputs. The trophy is the broadest extremum in the serve — the player is
 * sitting in the load, holding the position — so the trunk barely moves across
 * ±2 frames and the extra width is free.
 *
 * Shared rather than written out at each call site because the same posture is
 * read twice, once for the report and once for the diagnosis, and the two
 * drifting apart would mean the app disagreeing with itself about one trophy.
 */
export const TROPHY_POSTURE_RADIUS = 2

/**
 * The least shoulder rotation between the trophy and contact that can be trusted
 * to say which way "opening" is.
 *
 * A serve sweeps the shoulder line through 60–100° over that window; the
 * residual jitter on a yaw built from two averaged world-z coordinates is a few
 * degrees. Fifteen sits far below every real serve and far above the noise, so
 * it separates "this player did not rotate" from "this reading is unstable"
 * rather than sitting between them.
 */
export const MIN_OPENING_SWEEP_DEG = 15

/**
 * The least time from the trophy to contact that can contain an uncoil.
 *
 * The upward swing takes 300–450 ms for a club player and does not get much
 * under 250 even on tour. A window materially shorter than that has not caught a
 * fast serve, it has caught a trophy keyframe that landed in the wrong place —
 * and the sweep the coil sign is read from is then measured across a slice of
 * the swing rather than across the swing.
 *
 * In seconds rather than frames on purpose: the same misplacement has to read
 * the same way at 30 fps and at 240.
 */
const MIN_UNCOIL_WINDOW_S = 0.15

/** A coil reading, and whether the sweep its sign rests on could be resolved. */
export interface TrunkCoilReading {
  /** Signed coil in degrees, positive for a chest still held behind the hips. */
  deg: number
  /**
   * False when the shoulder sweep could not be recovered at all, which is not
   * the same statement as a coil of zero. Zero is a measurement — this player
   * held no separation — and it carries a fault and a fix. Unresolved means the
   * app could not look, and a card that names a fault off the back of that is
   * describing a serve nobody filmed.
   */
  resolved: boolean
}

/**
 * Total signed rotation of the shoulder *line* across a window, in degrees,
 * accumulated frame by frame rather than taken between the two ends.
 *
 * Two things fall out of accumulating, and both are the reason for it.
 *
 * The first is immunity to the tracker swapping left and right. A swap adds 180°
 * to one frame's yaw, and `wrapHalfTurn` cannot see 180° — so every increment,
 * and therefore the sum, is *exactly* unchanged no matter which frames are
 * swapped. Taken between two ends instead, the sweep had to be read as an arrow
 * to survive exceeding 90°, and an arrow does see the swap: MediaPipe relabels a
 * rotating torso, the serve rotates hardest between the trophy and contact, and
 * a swap on the contact frames alone flipped the sweep, flipped the coil sign
 * with it, and turned a textbook trophy into "your chest opens ahead of your
 * hips" at full confidence.
 *
 * The second is that a real sweep can pass 180° over the window, which a single
 * wrap aliases into a reversal of itself. Small per-frame increments cannot
 * alias: the shoulder line turns at most 20–30° between samples even at 30 fps
 * on a fast serve, nowhere near the 90° it would take.
 *
 * Deliberately reads each frame raw, where everything else here averages a frame
 * or two either side. Averaging *coordinates* across a swap mixes the two
 * shoulders together and collapses the line, which would hand back the very
 * failure this exists to remove; and the accumulation does not need the help,
 * because per-frame noise telescopes out of the sum and leaves only the noise on
 * the two ends — the same noise the two-endpoint version carried.
 */
function shoulderSweep(frames: Frame[], from: number, to: number): number {
  const yawAt = (i: number) =>
    groundYaw(frames[i].world[LM.leftShoulder], frames[i].world[LM.rightShoulder]) * DEG

  let total = 0
  let prev = yawAt(from)
  for (let i = from + 1; i <= to; i++) {
    const yaw = yawAt(i)
    total += wrapHalfTurn(yaw - prev)
    prev = yaw
  }
  return total
}

/**
 * How far the shoulder line lags the hip line at the trophy, in degrees about
 * world up, signed: positive is the chest still held behind the hips, negative
 * is a chest that has already unwound past them.
 *
 * The sign is the measurement. Folded into 0–90, as this once was, twenty-five
 * degrees of correct coil and twenty-five degrees of *already-open chest* come
 * back as the same number — so the player whose chest beat their hips to the
 * ball, which is the fault costing them the serve, was congratulated for the
 * separation of a good trophy. Nothing downstream can put the sign back either:
 * the sequencing signals are derived from when the two lines peak in time, and
 * say nothing about the shape the trophy was held in.
 *
 * What "behind" means, though, is not something the landmark labels can tell us.
 * It reverses with the hand, it reverses again if the clip is a mirrored
 * front-camera capture, and it reverses once more under the opposite world-z
 * convention — and this repo has no recorded MediaPipe footage to settle any of
 * those against (see `groundTruth.ts`, and `__tests__/fixtures/index.ts`, whose
 * RECORDED list is empty). Orienting by the racket side, as this used to,
 * assumed one answer to all three questions at once and could not be checked:
 * the synthetic rig and the code would simply be inverted together, with every
 * test passing precisely because neither could see it.
 *
 * So the direction is taken from the serve rather than assumed. Between the
 * trophy and contact the player uncoils and the shoulder line sweeps towards the
 * net, whoever they are and however the clip was captured; coil is the shoulders
 * lagging the hips in the direction opposite to that observed sweep. Nothing
 * here asks which way +z points or which hand holds the racket, so a right-hander,
 * a left-hander, a mirrored capture and either z convention all measure alike.
 *
 * Every angle here is read as a *line* rather than an arrow — the lag directly,
 * the sweep through the accumulation in `shoulderSweep` — so nothing in the
 * result can be moved by the tracker relabelling left and right on any subset of
 * frames. A magnitude that survives a swap multiplied by a sign that does not is
 * how a swap on three frames around contact used to invert the whole reading.
 *
 * `trophyRadius` is only ever passed by the tests, which need to be able to show
 * what the single-frame read this replaced would have reported.
 */
export function trunkCoilReading(
  frames: Frame[],
  trophy: number,
  contact: number,
  trophyRadius = TROPHY_POSTURE_RADIUS,
): TrunkCoilReading {
  if (!frames.length) return { deg: 0, resolved: false }

  const from = clamp(trophy, 0, frames.length - 1)
  const to = clamp(contact, 0, frames.length - 1)

  // A trophy that landed too near contact — or past it — leaves no swing to read
  // the sweep across, and the sweep then comes back small for a reason that has
  // nothing to do with the player. Returning a bare zero here is what let a
  // keyframe off by a third of a second be reported as "hips and chest locked",
  // with a fix and a drill, to somebody whose trophy coiled correctly.
  if (!(frames[to].t - frames[from].t >= MIN_UNCOIL_WINDOW_S)) return { deg: 0, resolved: false }

  const opening = shoulderSweep(frames, from, to)

  // Shoulders that barely turn across a window long enough to have shown it
  // leave the sign to be decided by noise, and a coin flip here does not read as
  // an uncertain number — it reads as a confident "textbook coil" or a confident
  // "your chest opened early", one of which is always wrong. Zero is the honest
  // answer and also the true one: a trunk that never rotated has no coil in it
  // whichever shape the trophy was held in. It is resolved, not unreadable, so
  // the card names the fault and carries its fix — barely rotating *is* arming
  // the ball.
  if (Math.abs(opening) < MIN_OPENING_SWEEP_DEG) return { deg: 0, resolved: true }

  const shouldersAtTrophy = groundYaw(
    steadyWorld(frames, trophy, LM.leftShoulder, trophyRadius),
    steadyWorld(frames, trophy, LM.rightShoulder, trophyRadius),
  )
  const hipsAtTrophy = groundYaw(
    steadyWorld(frames, trophy, LM.leftHip, trophyRadius),
    steadyWorld(frames, trophy, LM.rightHip, trophyRadius),
  )
  const lag = wrapHalfTurn((shouldersAtTrophy - hipsAtTrophy) * DEG)
  return { deg: opening > 0 ? -lag : lag, resolved: true }
}

/** The coil on its own, for the callers that carry its confidence separately. */
export function trunkCoil(
  frames: Frame[],
  trophy: number,
  contact: number,
  trophyRadius = TROPHY_POSTURE_RADIUS,
): number {
  return trunkCoilReading(frames, trophy, contact, trophyRadius).deg
}

/**
 * The largest jump the tracked body makes between consecutive samples, in body heights.
 *
 * The pose model is asked for one person, and it decides which one every frame
 * with no obligation to pick the same one twice. A coach standing to one side, a
 * player on the next court, somebody walking behind the baseline — any of them can
 * take over the tracking mid-clip, and when that happens the app measures a serve
 * assembled from two different bodies. Nothing else in the pipeline can see it:
 * every landmark is present, visibility stays high, and the numbers come out
 * looking perfectly ordinary.
 *
 * What gives it away is physics. Hips are the steadiest thing on a serving body
 * and they move smoothly — even a full leg drive shifts them a few percent of
 * standing height between samples. A hand-off to somebody standing two metres
 * away moves them most of a body height in a single frame, which no player does.
 *
 * Measured on the hips rather than a limb precisely because limbs genuinely do
 * move fast: the racket hand covers half a body height between the drop and
 * contact, so a wrist-based version of this would fire on every serve.
 */
export function maxTrackingJump(
  frames: Frame[],
  from: number,
  to: number,
  bodyHeight: number,
): number {
  if (!(bodyHeight > 0)) return 0
  const lo = clamp(Math.min(from, to), 0, frames.length - 1)
  const hi = clamp(Math.max(from, to), 0, frames.length - 1)
  let worst = 0
  for (let i = lo + 1; i <= hi; i++) {
    const a = midpoint(frames[i - 1].image[LM.leftHip], frames[i - 1].image[LM.rightHip])
    const b = midpoint(frames[i].image[LM.leftHip], frames[i].image[LM.rightHip])
    worst = Math.max(worst, dist2d(a, b) / bodyHeight)
  }
  return worst
}

/**
 * Beyond this, the tracked hips moved further in one sample than a serving body can.
 *
 * A leg drive shifts the hips by roughly 0.03 of standing height per sample at 30
 * fps. Slow motion makes that smaller, never larger. Sitting the threshold at
 * five times the fastest real motion leaves room for ordinary jitter and a
 * dropped frame or two while still being far below the distance to the next
 * person on the court.
 */
export const IMPLAUSIBLE_JUMP = 0.15

/** Mean visibility across the landmarks a serve actually depends on. */
export function keyVisibility(f: Frame): number {
  const keys = [
    LM.leftShoulder,
    LM.rightShoulder,
    LM.leftElbow,
    LM.rightElbow,
    LM.leftWrist,
    LM.rightWrist,
    LM.leftHip,
    LM.rightHip,
    LM.leftKnee,
    LM.rightKnee,
  ]
  return mean(keys.map((k) => f.image[k]?.visibility ?? 0))
}

/**
 * The sampled frame nearest a moment in the clip, by time.
 *
 * Lived inside `PosePlayer` as a `useCallback`, which put a binary search and a
 * nearest-neighbour tie-break somewhere no test could reach — and this one has
 * a documented failure mode that the player itself reasons about at length: the
 * browser snaps `currentTime` to a decoded frame boundary, so on a clip whose
 * boundaries sit more than half a sample off the pose cadence, the frame it
 * lands on is the *neighbour* of the one a keyframe was measured at. Whether
 * that is a near miss or a wild one depends entirely on the rounding here.
 *
 * Nearest rather than next-lowest, deliberately. The overlay is drawn against
 * whatever this returns, and picking the earlier frame every time would bias
 * the whole overlay half a sample behind the video — visible as a skeleton
 * trailing the body rather than sitting on it.
 *
 * `frames` must be sorted by `t`, which `bridgeDetectionGaps` guarantees: it
 * builds its output in sample order and compacts, so gaps widen the spacing but
 * never reorder it. Returns 0 for an empty array — no frame is the right answer
 * and there is no index for it, and every caller here indexes into the same
 * array and gets `undefined`, which they all already handle.
 */
export function nearestFrameIndex(frames: { t: number }[], t: number): number {
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) return lo - 1
  return lo
}
