/**
 * How fast the serve left the racket, read off the ball itself.
 *
 * WHY THE BALL AND NOT THE BODY. The obvious way to a serve speed is the arm:
 * the pose model tracks the wrist on every frame, and a faster arm is a faster
 * serve. Measured, it is not. On the forty Bath serves at 180 Hz the racket head
 * reaches 22–33 m/s while the wrist, the best body landmark for it, only goes
 * from 8.7 to 11.9 m/s, correlating with the head at 0.43 — and that is with
 * perfect joints, before any camera. A wrist-based figure is off by 11% on
 * average and by up to 31% on a single serve, and it is blind to exactly the
 * change a player is working for: a harder serve that comes from the racket
 * whipping through faster, which the wrist does not show. A number that cannot
 * see progress is not a number to give a player.
 *
 * So nothing here reads the body for speed. The ball is the one object in the
 * clip that actually carries the speed, and it is measured.
 *
 * THE RULER IS GRAVITY. A speed needs metres, and the picture has none. The
 * toss has them: a ball in free fall accelerates at g, so the curvature of the
 * toss's fitted arc, in frame heights per second squared, says how many frame
 * heights make a metre — at the toss's own distance from the lens, which is
 * where the ball is struck, because the ball is struck where it was tossed. No
 * height to enter and no assumption about the player's size: the clock and g.
 *
 * THE BALL CAN FLY TOWARDS OR AWAY FROM THE LENS. Filmed side-on, a serve aimed
 * wide or down the T travels up to fifteen degrees out of the picture, and the
 * phone is rarely exactly square. Ignoring that was measured, not guessed, on
 * balls launched from the real Bath racket positions through virtual phones:
 * flat image speed read anywhere from 26% slow to 23% fast, even dead side-on,
 * because a ball closing on the lens grows faster in the picture as it comes.
 * The depth motion leaves a signature — the track's own apparent acceleration,
 * which a ball in free flight does not have — so the fit below solves for it
 * (`fitTrack`), and the reading carries the speed along the depth axis too.
 *
 * WHAT IT NEEDS. The ball seen on at least five frames after it leaves the
 * strings (`MIN_SAMPLES`), with the timestamps those frames really have. At 30 frames a second
 * a 150 km/h serve crosses a side-on picture in one or two frames, so the
 * reading belongs to slow motion: the filming guide already asks for it.
 *
 * WHAT IT SAYS. A best figure and a range the true launch speed sits in, sized
 * by this clip's own fit — its noise, its length, its scale — plus what cannot
 * be known from one camera (the lens's focal length). Too wide a range is no
 * reading at all (`MAX_SPREAD`): a speed is said only when it can be stood
 * behind.
 *
 * DOM-free, like the rest of the vision layer: candidates in, a reading out.
 */

/* ------------------------------------------------------------- the physics */

/** Gravity, metres per second squared. */
export const GRAVITY = 9.81

/**
 * The ball's drag, as ½ρC_dA/m — per metre, so the deceleration is this times
 * the speed squared.
 *
 * C_d 0.507 is the free-flight figure for new balls, filmed in flight rather
 * than held in a wind tunnel, where it came out 15–20% higher; it did not vary
 * with spin or speed (Cross & Lindsey, "Measurements of drag and lift on tennis
 * balls in flight", Sports Engineering). Mass 57.7 g, the middle of the ITF's
 * 56.0–59.4 g; diameter 6.7 cm, the middle of 6.54–6.86; air 1.2 kg/m³. Over
 * the thirty-odd milliseconds a reading spans, a 45 m/s ball sheds about 3% of
 * its speed, so this is corrected for — and the uncertainty in every one of
 * those constants together moves the corrected figure by under half a percent.
 */
export const BALL_DRAG = (0.5 * 1.2 * 0.507 * Math.PI * 0.0335 ** 2) / 0.0577

/**
 * The lens's focal length, in units of the picture's long side.
 *
 * Only the depth half of the speed needs it, and only in proportion: the fit
 * measures the depth motion as a rate relative to the ball's distance, and the
 * distance in metres is the focal length over the scale. A phone's main lens is
 * about 26 mm full-frame equivalent, which on a 4:3 sensor cropped to 16:9 video
 * puts the long side at 67° — 0.75 of it — and stabilisation crops in a little
 * further. 0.80, give or take `FOCAL_SPREAD`.
 */
export const FOCAL_LONG_SIDE = 0.8

/** How far a phone's focal length may sit either way of `FOCAL_LONG_SIDE`, as a share. */
export const FOCAL_SPREAD = 0.18

/* ---------------------------------------------------------- the gates */

/**
 * The slowest and fastest launch a track may imply, metres per second.
 *
 * 50 km/h is slower than any serve that reaches the service box from the
 * baseline; 270 km/h is past the fastest ever recorded. Anything outside is
 * something else that was moving — the racket, the toss still falling, a bird.
 */
export const MIN_SPEED = 50 / 3.6
export const MAX_SPEED = 270 / 3.6

/**
 * Fewest frames the struck ball must be found on.
 *
 * Five, because the fit has five unknowns and two rows a frame: at three
 * frames it passes through almost any three points, so a racket point or a
 * stray blob taken for the ball is fitted as happily as the ball and nothing
 * is left over to say so. Measured with decoys in the frames: at three, a
 * racket point on one frame of three read a 47 m/s serve as 16 inside a range
 * of ±9%. Five leaves five rows spare to check the track against, and room for
 * the leave-one-out test in `steady` to find a sample that does not belong.
 */
export const MIN_SAMPLES = 5

/**
 * Widest range a reading may carry, as its half-width over its best figure.
 *
 * Twelve and a half percent either way is a range of about 35 km/h on a club
 * serve: wide enough to be honest about one camera, narrow enough to say
 * something a player can track. Wider than that is not a speed.
 */
export const MAX_SPREAD = 0.125

/**
 * How many standard errors out the range reaches, on the fit and on the scale.
 *
 * Two is the usual line, and it was checked rather than assumed: on the
 * simulated launches in `serveSpeed.test.ts` the true speed falls inside the
 * stated range at least 95% of the time in every placement and frame rate
 * the gates let through.
 */
const RANGE_SIGMAS = 2

/**
 * Where impact may be, seconds either side of the engine's contact.
 *
 * The engine's contact is the racket wrist at its highest, and on the Bath
 * serves the racket head is fastest — the nearest stand-in for impact the
 * capture has — 3 to 30 ms after it. Forty milliseconds before covers a wrist
 * peak read late; eighty after covers a wrist read early and a racket head
 * slow to arrive.
 */
export const IMPACT = { before: 0.04, after: 0.08 }

/** How long after contact the struck ball is looked for, seconds. */
export const LOOK_AFTER = 0.2

/**
 * The slowest frame rate a speed is looked for at, frames a second.
 *
 * Filmed side-on from the guide's four to six metres, a club serve crosses
 * what is left of a landscape picture after the toss in about a tenth of a
 * second. At 45 frames a second that is five frames, `MIN_SAMPLES`; slower
 * than that the ball cannot be seen often enough to fit, and saying so is
 * more use to a player than "I lost the ball". Measured on the simulated
 * launches: nothing is read at 30, about one serve in ten at 60.
 */
export const MIN_FPS = 45

/**
 * How closely the struck ball can be placed on its modelled track, frame
 * heights, however clean the centroids: a pixel of a 1,080-line read.
 *
 * The model is a straight flight with drag seen through a pinhole, and the
 * real flight bends a little away from it over a long track, by up to a few
 * ten-thousandths of the frame. With the band set by centroid noise alone, a
 * track with almost none had its own later samples thrown out as off the
 * track, and the cleanest clips read least often: 26 of 90 at 120 fps against
 * 55 once this floor was there, with the range still holding the truth.
 */
const TRACK_FLOOR = 1 / 1080

/**
 * How close the struck ball's path must come to the tossed ball, in standing
 * heights, at the moment the two meet.
 *
 * The ball is struck where the toss put it — that is what being struck means —
 * so the path a struck ball leaves on has to start on the toss's arc. Twelve
 * centimetres or so on a club player: the straight-line search extrapolates
 * back over up to a metre and a half of a path that bends in the picture, and
 * this is that bend's allowance and not much more. A tighter test than the
 * hand could ever give: the racket head is half a metre from the wrist at
 * impact, and the toss is exactly where the ball was.
 */
export const MEET = 0.12

/**
 * How steeply the struck ball may climb or dive in the picture, degrees from
 * level. A serve leaves the racket a few degrees below level, a kick a few
 * above; a ball travelling mostly up or down the picture is not a serve seen
 * from the side.
 */
const STEEPEST_RISE = 30
const STEEPEST_DIVE = 50

/**
 * How much of the speed may run along the lens's axis. Past sixty degrees out
 * of the picture the ball is not being seen from the side, whatever the body
 * said, and the depth half of the reading — the half that leans on the focal
 * length — would be most of it.
 */
const MAX_DEPTH_ANGLE = 60

/**
 * How far a track may bend away from a straight line before a candidate is not
 * on it, as a share of the distance travelled. A ball closing on the lens at
 * the steepest angle the gates allow changes its apparent speed by about this
 * much over a track, and that bend is what `fitTrack` then measures.
 */
const BEND = 0.15

/* ---------------------------------------------------------------- types */

/** One frame's ball candidates, on the serve's own clock. */
export interface StruckFrame {
  /** Seconds, real time — the frame's own timestamp, divided by any slow-motion stretch. */
  t: number
  /**
   * Candidate centres, in frame heights from the top-left corner: x already
   * multiplied by the aspect, as the pose landmarks are.
   */
  candidates: readonly { x: number; y: number }[]
}

/**
 * The tossed ball's path and the ruler it gives, on the serve's own clock and
 * in the levelled picture, frame heights with x multiplied by the aspect — see
 * `tossPath` for the model.
 */
export interface TossPath {
  /** The clock's origin, and the moment the ruler is read at: the engine's contact. */
  t0: number
  /** a₀, a₁, b₀, b₁, b₂, w in `tossPath`'s model. */
  terms: [number, number, number, number, number, number]
  /** The picture's middle, where the model's coordinates are measured from. */
  cx: number
  cy: number
  /** Frame heights per metre at the ball's distance from the lens at `t0`. */
  unitsPerMetre: number
  /** The standard error of that, as a share of it. */
  scaleError: number
}

/** What the clip says about where and how the ball should be found. */
export interface SpeedSetting {
  /** Engine contact, seconds on the same clock as the frames. */
  contactT: number
  /** Standing height, frame heights. */
  bodyHeight: number
  /** Which way across the picture the net is: the way the swing travelled. */
  netSide: 1 | -1
  /** Frame width over height. */
  aspect: number
  toss: TossPath
  /** How precisely one centroid is placed, frame heights — about a pixel of what was read. */
  noise: number
}

export interface StruckSample {
  t: number
  x: number
  y: number
}

/** The struck ball's track and what was fitted to it. */
export interface StruckTrack {
  samples: StruckSample[]
  /** When the struck path meets the toss: the moment of impact, on the frames' clock. */
  impactT: number
  fit: TrackFit
}

/** A serve speed, and the range it is good to. */
export interface ServeSpeed {
  /** Best figure for the launch speed, metres per second. */
  ms: number
  /** The range the true launch speed sits in, metres per second. */
  low: number
  high: number
  /** Frames the struck ball was found on. */
  samples: number
  /** Seconds between the first and last of them, real time. */
  span: number
  /** How much of the speed ran towards or away from the lens, degrees. */
  depthAngle: number
}

/**
 * Why there is no speed, in terms a player can act on — the report turns each
 * into a sentence.
 */
export type SpeedMiss =
  /** Filmed from the end of the court, where the ball flies into the lens. */
  | 'view'
  /** Too few frames a second for the ball to be seen more than once or twice. */
  | 'frame_rate'
  /** No toss tracked, so nothing to take metres from. */
  | 'no_toss'
  /** The browser would not say when each frame was taken. */
  | 'timing'
  /** The ball was not found leaving the racket. */
  | 'not_found'
  /** Found, but not cleanly enough to put a range on it worth saying. */
  | 'unsure'

/* ---------------------------------------------------------------- scale */

/**
 * The toss's path, and frame heights per metre from its fall.
 *
 * A ball in free fall drops at g, so the curvature of its fall in the picture,
 * in frame heights per second squared, is g times frame heights per metre at
 * its distance from the lens. That is the ruler.
 *
 * NOT A PARABOLA, THOUGH, AND IT WAS MEASURED. A toss is rarely straight up:
 * it drifts in front of the player and to one side, a few tenths of a metre
 * over a second of flight, and a ball moving towards or away from the lens
 * changes its apparent fall as it goes — the perspective term multiplies the
 * fall's speed, which a parabola reads as extra curvature. With drift of up
 * to 0.4 m/s in the simulation, a plain parabola's ruler took the stated range
 * of the speed from 99% coverage of the truth down to 93%, with misses to 11%.
 * So the toss gets the same pinhole model the struck ball does,
 *
 *     x(τ) = (a₀ + a₁·τ) / (1 + w·τ),   y(τ) = (b₀ + b₁·τ + b₂·τ²) / (1 + w·τ)
 *
 * measured from the picture's middle, with τ the time from `t0` and w the rate
 * its distance changes relative to itself. b₂ is then g/2 times the ruler at
 * the ball's distance at `t0` — contact, which is where the struck ball needs
 * it — and the drift's rate is fitted rather than ignored. Six unknowns, two
 * rows a sample, one small solve.
 *
 * AND NOT FREE FALL EITHER. A toss rises and falls at a few metres a second,
 * and drag at that speed is a few percent of g — adding to it on the way up,
 * taking from it on the way down — so a toss caught more on one side of its
 * top than the other reads a ruler that much off. Measured: one percent of
 * bias in every speed, and the stated range covering the truth 97% of the time
 * where without it the same serves were covered 99.5%. So drag is taken out
 * before the ruler is read: the fitted path gives the ball's speed along the
 * toss, drag on that speed is integrated twice into how far it moved the ball
 * (`dragDrop`), that is subtracted from where the ball was seen, and the
 * path is fitted again — twice, by when it has settled.
 *
 * Its standard error is the fit's, through the covariance, so a short or
 * scattered toss gives a ruler that says how unsure it is — and a range that
 * widens with it.
 */
export function tossPath(
  samples: readonly StruckSample[],
  opts: { noise: number; aspect: number; t0: number },
): TossPath | undefined {
  const { noise, aspect, t0 } = opts
  if (samples.length < 8) return undefined
  const cx = aspect / 2
  const cy = 0.5
  let drop = samples.map(() => 0)
  let solved: Solved | undefined
  for (let pass = 0; pass < 3; pass++) {
    const rows: number[][] = []
    const rhs: number[] = []
    samples.forEach((p, k) => {
      const tau = p.t - t0
      const x = p.x - cx
      // Where it would have been without drag, in the picture.
      const y = p.y - drop[k] - cy
      rows.push([1, tau, 0, 0, 0, -tau * x])
      rhs.push(x)
      rows.push([0, 0, 1, tau, tau * tau, -tau * y])
      rhs.push(y)
    })
    solved = leastSquares(rows, rhs, noise)
    if (!solved || !(solved.p[4] > 0)) return undefined
    if (pass < 2) drop = dragDrop(samples.map((p) => p.t - t0), solved.p)
  }
  if (!solved) return undefined
  const [a0, a1, b0, b1, b2, w] = solved.p
  // Image y grows downwards, so a falling ball curves positively.
  if (!(b2 > 0)) return undefined
  return {
    t0,
    terms: [a0, a1, b0, b1, b2, w],
    cx,
    cy,
    unitsPerMetre: (2 * b2) / GRAVITY,
    scaleError: Math.sqrt(Math.max(0, solved.cov[4][4])) / b2,
  }
}

/**
 * How far drag moved the tossed ball down the picture at each of `taus`,
 * frame heights, relative to the drag-free path through the same start.
 *
 * The fitted terms give the ball's speed in the picture along the toss, the
 * ruler they imply turns it into metres a second, and drag on the vertical —
 * opposing the motion, `BALL_DRAG` times the speed squared — is integrated
 * twice on a two-millisecond grid out from `t0` both ways. The offset and
 * the rate it leaves at `t0` are a position and a velocity the fit absorbs
 * anyway; what is left is the bend drag puts in the arc, which is what the
 * ruler must not read. Horizontal drag is left alone: a toss drifts at tenths
 * of a metre a second, where drag is nothing.
 */
function dragDrop(taus: readonly number[], terms: readonly number[]): number[] {
  const [a0, a1, b0, b1, b2, w] = terms
  const u0 = (2 * b2) / GRAVITY
  const step = 0.002
  const at = (tau: number) => {
    const den = 1 + w * tau
    // d/dτ of (b0 + b1τ + b2τ²)/(1 + wτ), and of (a0 + a1τ)/(1 + wτ).
    const vy = ((b1 + 2 * b2 * tau) * den - (b0 + b1 * tau + b2 * tau * tau) * w) / (den * den)
    const vx = (a1 * den - (a0 + a1 * tau) * w) / (den * den)
    const u = u0 / den
    // Metres a second, picture-down positive; drag opposes, so it pushes up when falling.
    const my = vy / u
    const mx = vx / u
    return { accel: -BALL_DRAG * Math.hypot(mx, my) * my, u }
  }
  // Out from τ = 0 in each direction, velocity and position both starting at zero.
  const walk = (to: number) => {
    const dir = Math.sign(to) || 1
    const out: { tau: number; pos: number }[] = [{ tau: 0, pos: 0 }]
    let vel = 0
    let pos = 0
    for (let tau = 0; Math.abs(tau) < Math.abs(to) + step; tau += dir * step) {
      const a = at(tau).accel
      const b = at(tau + dir * step).accel
      const v2 = vel + ((a + b) / 2) * dir * step
      pos += ((vel + v2) / 2) * dir * step
      vel = v2
      out.push({ tau: tau + dir * step, pos })
    }
    return out
  }
  const lo = Math.min(0, ...taus)
  const hi = Math.max(0, ...taus)
  const back = walk(lo)
  const ahead = walk(hi)
  return taus.map((tau) => {
    const path = tau < 0 ? back : ahead
    const i = Math.min(path.length - 1, Math.round(Math.abs(tau) / step))
    // Metres down, into frame heights at the ball's distance then.
    return path[i].pos * at(tau).u
  })
}

/**
 * Frame heights per metre at the ball's distance at `t`: the ruler at `t0`,
 * carried along by the toss's own drift towards or away from the lens.
 */
export function scaleAt(toss: TossPath, t: number): number {
  return toss.unitsPerMetre / (1 + toss.terms[5] * (t - toss.t0))
}

/** Where the tossed ball was, or would have been, at `t`. */
export function tossAt(toss: TossPath, t: number): { x: number; y: number } {
  const [a0, a1, b0, b1, b2, w] = toss.terms
  const tau = t - toss.t0
  const den = 1 + w * tau
  return { x: toss.cx + (a0 + a1 * tau) / den, y: toss.cy + (b0 + b1 * tau + b2 * tau * tau) / den }
}

/* ------------------------------------------------------------ the track */

/**
 * The struck ball, picked out of every candidate in the window after contact.
 *
 * RANSAC on pairs, for the reason `trackBall` uses it on triples: most of what
 * a colour-and-motion detector finds in these frames is not the ball — the
 * racket and the arm are moving faster than anything else in the picture, and
 * a yellow shirt is yellow. A pair from two frames is a velocity, and a
 * velocity has to pass every gate a struck serve passes before anything else is
 * counted against it: fast enough and not too fast in metres per second,
 * heading for the net, not climbing or diving like nothing a serve does, and
 * leaving from the toss at about the moment of contact. Only then are the
 * other frames asked whether they agree.
 */
export function trackStruckBall(frames: readonly StruckFrame[], s: SpeedSetting): StruckTrack | undefined {
  const pool: StruckSample[] = []
  for (const f of frames) {
    if (f.t < s.contactT - IMPACT.before || f.t > s.contactT + LOOK_AFTER) continue
    for (const c of f.candidates.slice(0, 4)) pool.push({ t: f.t, x: c.x, y: c.y })
  }
  // In time order, so one frame's candidates sit together for the count below.
  pool.sort((a, b) => a.t - b.t)
  if (pool.length < MIN_SAMPLES) return undefined

  const u = s.toss.unitsPerMetre
  const meet = MEET * s.bodyHeight
  const base = Math.max(3 * s.noise, 0.012)
  const hypotheses: { inliers: StruckSample[]; cost: number }[] = []

  for (let i = 0; i < pool.length; i++) {
    const a = pool[i]
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j]
      if (!(b.t > a.t)) continue
      const dt = b.t - a.t
      const vx = (b.x - a.x) / dt
      const vy = (b.y - a.y) / dt
      if (!plausibleVelocity(vx, vy, u, s.netSide)) continue
      const impactT = meetsToss(a, vx, vy, s, meet)
      if (impactT === undefined || !(a.t > impactT)) continue

      // Every later frame's best agreeing candidate, one per frame.
      const inliers: StruckSample[] = []
      let cost = 0
      let frameT = Number.NaN
      let frameBest: { p: StruckSample; r: number } | undefined
      const flush = () => {
        if (frameBest) {
          inliers.push(frameBest.p)
          cost += frameBest.r
        }
        frameBest = undefined
      }
      const speed = Math.hypot(vx, vy)
      for (const p of pool) {
        if (p.t !== frameT) {
          flush()
          frameT = p.t
        }
        if (!(p.t > impactT)) continue
        const along = Math.abs(p.t - a.t) * speed
        const r = Math.hypot(p.x - (a.x + vx * (p.t - a.t)), p.y - (a.y + vy * (p.t - a.t)))
        if (r > base + BEND * along) continue
        if (!frameBest || r < frameBest.r) frameBest = { p, r }
      }
      flush()
      if (inliers.length >= MIN_SAMPLES) hypotheses.push({ inliers, cost })
    }
  }
  if (!hypotheses.length) return undefined

  // The strongest few, each refined against the full model, and the best of
  // those kept. Not just the first: the racket leaves the toss with the ball
  // and travels beside it for the first frames, so the straight line with the
  // most agreement can be one that took a racket point for the ball early on —
  // and refinement is what tells the two apart.
  hypotheses.sort((a, b) => b.inliers.length - a.inliers.length || a.cost - b.cost)
  let best: StruckTrack | undefined
  for (const h of hypotheses.slice(0, HYPOTHESES)) {
    const track = refine(h.inliers, pool, s)
    if (!track) continue
    if (
      !best ||
      track.samples.length > best.samples.length ||
      (track.samples.length === best.samples.length && track.fit.sigma < best.fit.sigma)
    ) {
      best = track
    }
  }
  return best
}

/**
 * Hypotheses refined, strongest first.
 *
 * Twenty-four, not six. The racket leaves the toss with the ball, and at high
 * frame rates it is in shot on many more frames than the ball, so the lines
 * with the most agreement are mostly the racket's and near-copies of each
 * other. With six refined, the ball's line often never got its turn, and 240
 * fps read fewer serves than 120 with decoys in the frames: 36 of 90 against
 * 54 with twenty-four, the range holding the truth on every one. A refine is
 * a few small solves, so the cost is milliseconds a serve.
 */
const HYPOTHESES = 24

/**
 * How far off the fitted track a candidate may sit and still be the ball, in
 * centroid noises. The model is the physics of a ball in flight seen through a
 * lens, so the ball itself sits within the centroid noise of it; four of those
 * keeps nearly every true detection and almost nothing that is not.
 */
const ON_TRACK = 4

/**
 * A straight-line pick, fitted properly and then re-picked against that fit:
 * each frame's candidate nearest the modelled track, if it is near enough, and
 * the fit taken again — until the picks stop changing. A racket point taken
 * for the ball on an early frame sits off a track that bends the way a ball's
 * does, and is swapped for the ball or dropped.
 */
function refine(start: readonly StruckSample[], pool: readonly StruckSample[], s: SpeedSetting): StruckTrack | undefined {
  let samples = [...start]
  let settled = settle(samples, s)
  for (let pass = 0; pass < 4 && settled; pass++) {
    const { fit, impactT } = settled
    const band = ON_TRACK * Math.max(s.noise, TRACK_FLOOR)
    const picked: StruckSample[] = []
    let frameT = Number.NaN
    let frameBest: { p: StruckSample; r: number } | undefined
    const flush = () => {
      if (frameBest) picked.push(frameBest.p)
      frameBest = undefined
    }
    for (const p of pool) {
      if (p.t !== frameT) {
        flush()
        frameT = p.t
      }
      // Strictly after: at impact the racket is where the ball is, and a racket
      // point there, filed under the ball, bent a twelve-sample fit 16% slow.
      if (!(p.t > impactT)) continue
      const at = trackAt(fit, p.t)
      if (!at) continue
      const r = Math.hypot(p.x - at.x, p.y - at.y)
      if (r <= band && (!frameBest || r < frameBest.r)) frameBest = { p, r }
    }
    flush()
    if (picked.length < MIN_SAMPLES) return undefined
    const same = picked.length === samples.length && picked.every((p, k) => p === samples[k])
    samples = picked
    if (same) break
    settled = settle(samples, s)
  }
  if (!settled) return undefined
  return steady({ samples, impactT: settled.impactT, fit: settled.fit }, s)
}

/**
 * How far leaving one sample out may move the speed before that sample is the
 * reading rather than evidence for it, as a share of the speed — at least.
 * A track whose stated range is wider gets half of that range instead: on a
 * short track an end sample is legitimately worth more than three percent,
 * and the range already says so.
 */
const STEADY = 0.03

/**
 * Leave each sample out in turn; if one of them moves the speed by more than
 * `STEADY` (or half the reading's own range) on its own, it goes, and the test
 * runs again — twice at most, then a track that still hangs on single frames
 * is not a reading.
 *
 * The re-pick in `refine` catches a point off the track; this catches one the
 * track bent to reach. A fit with five unknowns can bow towards a bad point
 * enough to make its residual look like noise, and what gives it away is that
 * the answer depends on it.
 */
function steady(track: StruckTrack, s: SpeedSetting): StruckTrack | undefined {
  let current = track
  for (let round = 0; round < 3; round++) {
    const v = current.fit.speed
    const reading = speedOf(current, s)
    // Too loose to say anything already — `speedOf` will decline it as unsure.
    if (!reading) return current
    const allowed = Math.max(STEADY, (reading.high - reading.low) / (4 * v))
    let worst = -1
    let worstShift = 0
    for (let k = 0; k < current.samples.length; k++) {
      const without = current.samples.filter((_, j) => j !== k)
      const fit = settle(without, s)
      // A sample the track cannot do without at all is the most influential of all.
      const shift = fit ? Math.abs(fit.fit.speed - v) / v : Infinity
      if (shift > worstShift) {
        worstShift = shift
        worst = k
      }
    }
    if (worstShift <= allowed) return current
    if (round === 2 || current.samples.length - 1 < MIN_SAMPLES) return undefined
    const fewer = current.samples.filter((_, j) => j !== worst)
    const again = settle(fewer, s)
    if (!again) return undefined
    current = { samples: fewer, impactT: again.impactT, fit: again.fit }
  }
  return undefined
}

/**
 * The fit from contact, then from the moment the fitted path meets the toss,
 * twice. The scale the toss gives is the scale at the ball's distance at
 * impact, and the fit's velocity terms are in that scale only when its clock
 * starts there — started at the engine's contact instead, up to thirty
 * milliseconds early, a ball closing on the lens was read up to 7% fast and
 * one leaving it as slow, by exactly that lag times the rate the depth
 * changes.
 */
function settle(samples: readonly StruckSample[], s: SpeedSetting): { fit: TrackFit; impactT: number } | undefined {
  let t0 = s.contactT
  let fit = fitTrack(samples, s, t0)
  for (let pass = 0; pass < 2 && fit; pass++) {
    const met = impactOf(fit, s)
    if (met === undefined) return undefined
    t0 = met
    fit = fitTrack(samples, s, t0)
  }
  if (!fit) return undefined
  // The ball cannot be seen struck before it was struck.
  if (!(samples[0].t > t0)) return undefined
  return { fit, impactT: t0 }
}

function plausibleVelocity(vx: number, vy: number, u: number, netSide: 1 | -1): boolean {
  if (Math.sign(vx) !== netSide) return false
  const speed = Math.hypot(vx, vy) / u
  // Generous at both ends: this is the picture's speed, which a ball flying
  // out of the picture under-reads and one closing on the lens over-reads.
  if (speed < MIN_SPEED * 0.5 || speed > MAX_SPEED * 1.5) return false
  // Image y is down, so a dive is positive.
  const angle = (Math.atan2(vy, Math.abs(vx)) * 180) / Math.PI
  return angle >= -STEEPEST_RISE && angle <= STEEPEST_DIVE
}

/**
 * When the straight line through `a` at this velocity passes the toss, if it
 * comes within `meet` of it while impact is possible — the moment it comes
 * closest, scanned at a millisecond.
 */
function meetsToss(a: StruckSample, vx: number, vy: number, s: SpeedSetting, meet: number): number | undefined {
  let bestT: number | undefined
  let bestD = Infinity
  for (let t = s.contactT - IMPACT.before; t <= s.contactT + IMPACT.after; t += 0.001) {
    const toss = tossAt(s.toss, t)
    const d = Math.hypot(a.x + vx * (t - a.t) - toss.x, a.y + vy * (t - a.t) - toss.y)
    if (d < bestD) {
      bestD = d
      bestT = t
    }
  }
  return bestD <= meet ? bestT : undefined
}

/** The moment the fitted path comes closest to the toss, or undefined if it never comes near. */
function impactOf(fit: TrackFit, s: SpeedSetting): number | undefined {
  let bestT: number | undefined
  let bestD = Infinity
  for (let t = s.contactT - IMPACT.before; t <= s.contactT + IMPACT.after; t += 0.0005) {
    const p = trackAt(fit, t)
    if (!p) continue
    const toss = tossAt(s.toss, t)
    const d = Math.hypot(p.x - toss.x, p.y - toss.y)
    if (d < bestD) {
      bestD = d
      bestT = t
    }
  }
  return bestD <= MEET * s.bodyHeight ? bestT : undefined
}

/* -------------------------------------------------------------- the fit */

/**
 * The track as a ball flying in a straight line at a speed drag is taking off
 * it, seen through a pinhole.
 *
 * Relative to the middle of the picture, a point at depth Z appears at f·X/Z.
 * A ball launched at `t0` with velocity (Ẋ, Ẏ, Ż) from distance Z₀ has
 * travelled s(t)/V of each component after time t, where s is the distance
 * along its path, so in the picture
 *
 *     x(τ) = (A + B·τ) / (1 + w·τ),   y(τ) = (C + D·τ) / (1 + w·τ)
 *
 * with τ = s(t)/V the time it would have taken without drag, A and C where it
 * was at `t0`, B = u·Ẋ and D = u·Ẏ (u the scale at Z₀) and w = Ż/Z₀. Multiply
 * through and every row is linear in the five unknowns, so the fit is one small
 * least-squares solve. The drop under gravity — under a centimetre over the
 * window — is taken off y first, at the toss's scale.
 *
 * Drag makes τ depend on the speed being fitted, so the fit runs three times:
 * a straight line first for a speed, then τ from it, then again from the
 * better speed. It has settled to well under a tenth of a percent by then.
 */
export interface TrackFit {
  /** The clock's origin: the moment the scale applies at. */
  t0: number
  /** A, B, C, D, w above. */
  terms: [number, number, number, number, number]
  /** Launch speed at the nominal focal length, metres per second. */
  speed: number
  /** Covariance of (B, D, w), for the range. */
  cov: number[][]
  /** Scatter about the fit, frame heights, floored at the centroid noise. */
  sigma: number
  /** Each sample's distance off the fitted track, frame heights. */
  residuals: number[]
  /** The picture's middle and the scale, as the fit used them. */
  frame: { cx: number; cy: number; u: number }
}

export function fitTrack(samples: readonly StruckSample[], s: SpeedSetting, t0: number): TrackFit | undefined {
  if (samples.length < MIN_SAMPLES) return undefined
  // The ruler at the moment the fit's clock starts, which `settle` makes impact.
  const u = scaleAt(s.toss, t0)
  const focal = focalFrameHeights(s.aspect)
  // The middle of the picture, where the lens's axis meets it.
  const cx = s.aspect / 2
  const cy = 0.5

  // A first speed from the straight line, for the drag correction.
  let speed = lineSpeed(samples) / u
  if (!(speed > 0)) return undefined
  let solved: Solved | undefined
  for (let pass = 0; pass < 3; pass++) {
    solved = solve(samples, dragClock(speed, t0), { u, cx, cy, t0, noise: s.noise })
    if (!solved) return undefined
    speed = speedFrom(solved.p[1], solved.p[3], solved.p[4], u, focal)
  }
  if (!solved) return undefined
  const [A, B, C, D, w] = solved.p
  return {
    t0,
    terms: [A, B, C, D, w],
    speed,
    cov: [
      [solved.cov[1][1], solved.cov[1][3], solved.cov[1][4]],
      [solved.cov[3][1], solved.cov[3][3], solved.cov[3][4]],
      [solved.cov[4][1], solved.cov[4][3], solved.cov[4][4]],
    ],
    sigma: solved.sigma,
    residuals: solved.residuals,
    frame: { cx, cy, u },
  }
}

/** Distance along the path over V since `t0`, for a ball shedding speed to drag. */
function dragClock(speed: number, t0: number): (t: number) => number {
  const k = BALL_DRAG * speed
  return (t: number) => {
    const dt = t - t0
    // The straight-line limit where drag has nothing to act on, and before
    // launch, where the logarithm would run out of road.
    return Math.abs(k * dt) < 1e-9 || 1 + k * dt <= 0 ? dt : Math.log(1 + k * dt) / k
  }
}

/** Where the fitted track puts the ball at `t`, in frame heights — undefined behind the lens. */
export function trackAt(fit: TrackFit, t: number): { x: number; y: number } | undefined {
  const [A, B, C, D, w] = fit.terms
  const tau = dragClock(fit.speed, fit.t0)(t)
  const den = 1 + w * tau
  if (!(den > 0.05)) return undefined
  const dt = t - fit.t0
  return {
    x: fit.frame.cx + (A + B * tau) / den,
    y: fit.frame.cy + (C + D * tau) / den + 0.5 * GRAVITY * fit.frame.u * dt * dt,
  }
}

/** Launch speed from the fitted terms, metres per second. */
export function speedFrom(B: number, D: number, w: number, u: number, focal: number): number {
  return Math.hypot(B, D, w * focal) / u
}

/** The focal length in frame heights, from `FOCAL_LONG_SIDE` and which way up the phone was. */
export function focalFrameHeights(aspect: number): number {
  return FOCAL_LONG_SIDE * Math.max(aspect, 1)
}

interface Solved {
  /** A, B, C, D, w. */
  p: number[]
  cov: number[][]
  sigma: number
  residuals: number[]
}

function solve(
  samples: readonly StruckSample[],
  tau: (t: number) => number,
  at: { u: number; cx: number; cy: number; t0: number; noise: number },
): Solved | undefined {
  const { u, cx, cy, t0, noise } = at
  const rows: number[][] = []
  const rhs: number[] = []
  for (const p of samples) {
    const tt = tau(p.t)
    const dt = p.t - t0
    const x = p.x - cx
    // The drop under gravity since launch, at the scale of the toss.
    const y = p.y - 0.5 * GRAVITY * u * dt * dt - cy
    rows.push([1, tt, 0, 0, -tt * x])
    rhs.push(x)
    rows.push([0, 0, 1, tt, -tt * y])
    rhs.push(y)
  }
  return leastSquares(rows, rhs, noise)
}

/**
 * Ordinary least squares, with the covariance of the answer and each sample's
 * residual — rows come in x/y pairs, one pair a sample. The scatter is floored
 * at the centroid noise: no blob is placed better than about a pixel, whatever
 * the residuals of a short fit say.
 */
function leastSquares(rows: number[][], rhs: number[], noise: number): Solved | undefined {
  const n = rows[0].length
  const ata = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const atb = new Array<number>(n).fill(0)
  for (let k = 0; k < rows.length; k++) {
    for (let i = 0; i < n; i++) {
      atb[i] += rows[k][i] * rhs[k]
      for (let j = 0; j < n; j++) ata[i][j] += rows[k][i] * rows[k][j]
    }
  }
  const inv = invert(ata)
  if (!inv) return undefined
  const p = inv.map((row) => row.reduce((s, v, j) => s + v * atb[j], 0))
  const residuals: number[] = []
  let ss = 0
  for (let k = 0; k + 1 < rows.length; k += 2) {
    const rx = rhs[k] - rows[k].reduce((s, v, j) => s + v * p[j], 0)
    const ry = rhs[k + 1] - rows[k + 1].reduce((s, v, j) => s + v * p[j], 0)
    ss += rx * rx + ry * ry
    residuals.push(Math.hypot(rx, ry))
  }
  // Every unknown spent is a row that can no longer show scatter.
  const dof = Math.max(1, rows.length - n)
  const sigma = Math.max(noise, Math.sqrt(ss / dof))
  const cov = inv.map((row) => row.map((v) => v * sigma * sigma))
  return { p, cov, sigma, residuals }
}

/** The straight-line speed through the samples, frame heights per second. */
function lineSpeed(samples: readonly StruckSample[]): number {
  const n = samples.length
  const mt = samples.reduce((s, p) => s + p.t, 0) / n
  const mx = samples.reduce((s, p) => s + p.x, 0) / n
  const my = samples.reduce((s, p) => s + p.y, 0) / n
  let tt = 0
  let tx = 0
  let ty = 0
  for (const p of samples) {
    tt += (p.t - mt) ** 2
    tx += (p.t - mt) * (p.x - mx)
    ty += (p.t - mt) * (p.y - my)
  }
  return tt > 0 ? Math.hypot(tx / tt, ty / tt) : 0
}

/* ------------------------------------------------------------- the reading */

/**
 * The serve's speed, or why there is none.
 */
export function measureServeSpeed(
  frames: readonly StruckFrame[],
  s: SpeedInput,
): { speed: ServeSpeed } | { miss: SpeedMiss } {
  // Each reason is checked in the order a player could act on it: the clock,
  // then the frame rate, then the toss, before any ball is looked for.
  const times = frames.map((f) => f.t)
  if (times.some((t, k) => !Number.isFinite(t) || (k > 0 && !(t > times[k - 1])))) return { miss: 'timing' }
  const gaps = times.slice(1).map((t, k) => t - times[k]).sort((a, b) => a - b)
  if (gaps.length && gaps[Math.floor(gaps.length / 2)] > 1 / MIN_FPS) return { miss: 'frame_rate' }
  if (!s.toss) return { miss: 'no_toss' }
  const setting: SpeedSetting = { ...s, toss: s.toss }
  const track = trackStruckBall(frames, setting)
  if (!track) return { miss: 'not_found' }
  const reading = readingOf(track, setting)
  return typeof reading === 'string' ? { miss: reading } : { speed: reading }
}

/**
 * What `measureServeSpeed` needs: a `SpeedSetting` whose toss may be missing,
 * since "no toss was tracked" is one of the answers it gives.
 */
export type SpeedInput = Omit<SpeedSetting, 'toss'> & { toss: TossPath | undefined }

/**
 * The range comes from where the fit could be, not from a slope at where it is.
 *
 * The obvious way — the speed's gradient through the fit's covariance — is
 * wrong here, and it was measured wrong: on short tracks it stated ranges the
 * true speed fell outside one time in five. The speed is a length,
 * √(B² + D² + (w·f)²), and where the fitted depth rate w sits near zero its
 * slope in w is near zero too, so a linearised error says the depth costs
 * nothing at exactly the point where it is least pinned down. A ball leaving
 * the lens at twenty-five degrees then reads ten percent slow inside a range
 * that swears it cannot.
 *
 * So the speed is evaluated across the fit's two-sigma ellipsoid itself — the
 * centre and twenty-six points on its surface, along the axes, the edges and
 * the corners of the cube it sits in — at three focal lengths, the nominal one
 * and `FOCAL_SPREAD` either way. The lowest and highest of those, widened by
 * the toss's scale error (two of its own standard errors, applied to all of
 * the speed), are the range. For a straight function this is exactly two
 * standard errors along the gradient; for this one it follows the bend.
 * The errors are added rather than combined in quadrature: a scale and a lens
 * that are off are off for every frame, and do not average away.
 */
export function speedOf(track: StruckTrack, s: SpeedSetting): ServeSpeed | undefined {
  const reading = readingOf(track, s)
  return typeof reading === 'string' ? undefined : reading
}

/**
 * `speedOf`, saying which gate refused when one did: a ball running mostly
 * along the lens's axis is a camera in the wrong place (`view`), which a
 * player can fix; anything else is a track not clean enough (`unsure`).
 */
function readingOf(track: StruckTrack, s: SpeedSetting): ServeSpeed | SpeedMiss {
  const { fit } = track
  const u = fit.frame.u
  const focal = focalFrameHeights(s.aspect)
  const [, B, , D, w] = fit.terms
  // The best figure with the depth term debiased: a fitted w carries noise, and
  // noise squared only ever adds, so w² overstates the depth motion by w's own
  // variance — about a percent on a typical clip, always upwards. E[ŵ²] = w² +
  // var(ŵ), so that variance comes off, never past zero.
  const depth2 = Math.max(0, w * w - fit.cov[2][2])
  const v = Math.hypot(B, D, Math.sqrt(depth2) * focal) / u
  if (!(v >= MIN_SPEED && v <= MAX_SPEED)) return 'unsure'

  const depthAngle = (Math.atan2(Math.abs(w * focal), Math.hypot(B, D)) * 180) / Math.PI
  if (depthAngle > MAX_DEPTH_ANGLE) return 'view'

  const root = cholesky3(fit.cov)
  if (!root) return 'unsure'
  let lo = Infinity
  let hi = -Infinity
  for (const d of ELLIPSOID) {
    // A point on the ellipsoid: the fit plus two standard deviations of it in direction d.
    const e = [0, 1, 2].map((r) => RANGE_SIGMAS * (root[r][0] * d[0] + root[r][1] * d[1] + root[r][2] * d[2]))
    for (const lens of [1 - FOCAL_SPREAD, 1, 1 + FOCAL_SPREAD]) {
      const at = speedFrom(B + e[0], D + e[1], w + e[2], u, focal * lens)
      if (at < lo) lo = at
      if (at > hi) hi = at
    }
  }
  const scale = RANGE_SIGMAS * s.toss.scaleError
  const low = lo * (1 - scale)
  const high = hi * (1 + scale)
  if (Math.max(v - low, high - v) / v > MAX_SPREAD) return 'unsure'
  const span = track.samples[track.samples.length - 1].t - track.samples[0].t
  return { ms: v, low, high, samples: track.samples.length, span, depthAngle }
}

/**
 * The centre and twenty-six unit directions: the six axes, twelve edges and
 * eight corners of a cube, normalised.
 */
const ELLIPSOID: number[][] = (() => {
  const out: number[][] = [[0, 0, 0]]
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        const n = Math.hypot(x, y, z)
        if (n > 0) out.push([x / n, y / n, z / n])
      }
    }
  }
  return out
})()

/** Lower-triangular L with L·Lᵀ = m, for a 3×3 covariance; undefined if it is not one. */
function cholesky3(m: number[][]): number[][] | undefined {
  const L = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j]
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      if (i === j) {
        // A variance a hair under zero is rounding, not information.
        if (sum < -1e-12 * Math.max(1e-300, Math.abs(m[i][i]))) return undefined
        L[i][i] = Math.sqrt(Math.max(0, sum))
      } else {
        L[i][j] = L[j][j] > 0 ? sum / L[j][j] : 0
      }
    }
  }
  return L
}

/* ------------------------------------------------------------- algebra */

/** Gauss–Jordan inverse with partial pivoting, or undefined for a singular matrix. */
function invert(m: number[][]): number[][] | undefined {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  // Each column judged against its own size: the time terms are hundredths of
  // the constant ones, and one absolute threshold would call them singular.
  const size = Array.from({ length: n }, (_, c) => Math.max(...m.map((row) => Math.abs(row[c]))))
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    if (!(Math.abs(a[pivot][col]) > 1e-12 * size[col])) return undefined
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    const lead = a[col][col]
    for (let j = 0; j < 2 * n; j++) a[col][j] /= lead
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]
    }
  }
  return a.map((row) => row.slice(n))
}
