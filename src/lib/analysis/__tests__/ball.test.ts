/**
 * Ball tracking, driven by rendered frames rather than real video.
 *
 * The point of testing a detector on synthetic pixels is not to prove it works
 * on a real court — only recorded fixtures can do that. It is to pin down the
 * things that must hold whatever the footage looks like: that a ball on a
 * parabola is recovered with the apex in the right place, that a detector given
 * nothing ball-shaped reports nothing rather than something, and above all that
 * clutter moving through the frame cannot be mistaken for a toss. The last is
 * what a colour threshold on its own would get wrong, and what the free-fall
 * constraint exists to prevent.
 */
import {
  findCandidates,
  flightHeightAt,
  frameChange,
  levelOutbound,
  trackBall,
  trackOutbound,
  type Bitmap,
  type OutboundTrack,
} from '../../vision/ballTrack'
import { readOutboundFlight } from '../analyze'
import { imageXSplit } from '../axes'
import { assert, check, heading, near, note, report, within } from './harness'

const W = 240
const H = 426

/** Deterministic noise; a detector test that fails one run in twenty is useless. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface Disc {
  x: number
  y: number
  /** Radius as a fraction of frame height. */
  r: number
  colour: [number, number, number]
  /**
   * Motion blur: a trail behind the disc `len` pixels long, in the direction
   * `(dx, dy)`, fading toward the tail. Approximates what a real shutter open
   * for a slice of the frame interval does to a fast-moving ball, rather than
   * the hard-edged circle below — which is what makes a low-fps, blurrier
   * clip a harder detection problem than a clean one at the same distance.
   */
  smear?: { dx: number; dy: number; len: number }
}

/**
 * Render a frame: a sky gradient, a dark player-ish block low in the shot, and
 * whatever discs were asked for. Deliberately crude — the detector only ever
 * sees colour, motion and shape, so anything more detailed would be scenery for
 * its own sake.
 */
function render(discs: Disc[], seed: number, noise = 6): Bitmap {
  const rand = seeded(seed)
  const data = new Uint8ClampedArray(W * H * 4)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const down = y / H
      // Sky: strongly blue, which is the hardest background for a yellow ball to
      // be lost against and the easiest for it to be found against.
      let r = 120 + 60 * down
      let g = 165 + 50 * down
      let b = 225 - 30 * down
      // The player and the court, dark and low in frame.
      if (down > 0.55) {
        r = 60 + 30 * down
        g = 85 + 20 * down
        b = 70
      }
      const n = (rand() - 0.5) * 2 * noise
      data[i] = r + n
      data[i + 1] = g + n
      data[i + 2] = b + n
      data[i + 3] = 255
    }
  }

  for (const d of discs) {
    const cx = d.x * W
    const cy = d.y * H
    const rad = d.r * H
    const trailLen = d.smear?.len ?? 0
    const dirMag = d.smear ? Math.hypot(d.smear.dx, d.smear.dy) || 1 : 1
    const dirx = d.smear ? d.smear.dx / dirMag : 0
    const diry = d.smear ? d.smear.dy / dirMag : 0
    const x0 = Math.max(0, Math.floor(cx - rad - trailLen - 1))
    const x1 = Math.min(W - 1, Math.ceil(cx + rad + trailLen + 1))
    const y0 = Math.max(0, Math.floor(cy - rad - trailLen - 1))
    const y1 = Math.min(H - 1, Math.ceil(cy + rad + trailLen + 1))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4
        if (trailLen > 0) {
          // Distance to the nearest point on the trail behind the disc, not
          // just to its centre — that is what turns a circle into a streak.
          const px = x - cx
          const py = y - cy
          const t = Math.max(-trailLen, Math.min(0, px * dirx + py * diry))
          const dx = px - t * dirx
          const dy = py - t * diry
          if (dx * dx + dy * dy > rad * rad) continue
          // Fades toward the tail, as a real motion-blur streak does rather
          // than staying uniformly saturated end to end.
          const along = -t / Math.max(1, trailLen)
          const fade = 1 - 0.6 * along
          data[i] = data[i] + (d.colour[0] - data[i]) * fade
          data[i + 1] = data[i + 1] + (d.colour[1] - data[i + 1]) * fade
          data[i + 2] = data[i + 2] + (d.colour[2] - data[i + 2]) * fade
        } else {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue
          data[i] = d.colour[0]
          data[i + 1] = d.colour[1]
          data[i + 2] = d.colour[2]
        }
      }
    }
  }

  return { data, width: W, height: H }
}

const BALL: [number, number, number] = [214, 245, 66]

/** A toss: up from the hand, over the top, back down, in frame-normalised y. */
function tossFrames(opts: {
  apexT: number
  apexY: number
  gravity: number
  x0: number
  driftX: number
  seed?: number
  extra?: (t: number) => Disc[]
  fps?: number
  duration?: number
  /**
   * Fraction of one frame interval the shutter is treated as open for, which
   * bounds how far the ball can smear in a single shot — a real camera
   * cannot expose for longer than the gap between frames without doubling
   * up on the next one. 1.0 is already about as blurry as ordinary video
   * gets; higher noise, not more of this, is what a worse phone adds.
   */
  blurExposure?: number
  noise?: number
}) {
  const fps = opts.fps ?? 30
  const duration = opts.duration ?? 0.9
  const count = Math.round(duration * fps)
  const dt = 1 / fps
  const out: { t: number; bitmap: Bitmap; truth: { x: number; y: number } }[] = []

  for (let i = 0; i < count; i++) {
    const t = i / fps
    const rt = t - opts.apexT
    const y = opts.apexY + 0.5 * opts.gravity * rt * rt
    const x = opts.x0 + opts.driftX * t
    const smear = opts.blurExposure
      ? (() => {
          const vy = opts.gravity * rt // d/dt of the parabola
          const vx = opts.driftX
          return { dx: vx, dy: vy, len: Math.hypot(vx, vy) * H * dt * opts.blurExposure! }
        })()
      : undefined
    const discs: Disc[] = [{ x, y, r: 0.011, colour: BALL, smear }, ...(opts.extra?.(t) ?? [])]
    out.push({
      t,
      bitmap: render(discs, (opts.seed ?? 7) + i * 977, opts.noise ?? 6),
      truth: { x, y },
    })
  }
  return out
}

const candidatesFor = (
  shots: { t: number; bitmap: Bitmap }[],
  belowY = 0.62,
) =>
  shots.map((s, i) => ({
    t: s.t,
    candidates: findCandidates(s.bitmap, i > 0 ? shots[i - 1].bitmap : undefined, { belowY }),
  }))

/* ------------------------------------------------------------------ detection */

heading('Spotting the ball in a frame')

check('a ball against sky is found', () => {
  const shots = tossFrames({ apexT: 0.45, apexY: 0.16, gravity: 2.8, x0: 0.45, driftX: 0.04 })
  const found = findCandidates(shots[6].bitmap, shots[5].bitmap, { belowY: 0.62 })
  assert(found.length > 0, 'no candidate at all on a clean frame')
  const best = found[0]
  near(best.x, shots[6].truth.x, 0.02, 'candidate x')
  near(best.y, shots[6].truth.y, 0.02, 'candidate y')
})

check('an empty sky produces nothing', () => {
  const a = render([], 11)
  const b = render([], 12)
  assert(findCandidates(b, a, { belowY: 0.62 }).length === 0, 'invented a ball out of noise')
})

check('things far too big to be a ball are ignored', () => {
  const a = render([], 21)
  const b = render([{ x: 0.5, y: 0.3, r: 0.14, colour: BALL }], 22)
  assert(
    findCandidates(b, a, { belowY: 0.62 }).length === 0,
    'a yellow shape seven times ball-sized was accepted',
  )
})

check('the region below the shoulders is not searched', () => {
  const a = render([], 31)
  // A yellow shirt down where the player is; the ball is never down there.
  const b = render([{ x: 0.5, y: 0.8, r: 0.012, colour: BALL }], 32)
  assert(findCandidates(b, a, { belowY: 0.6 }).length === 0, 'searched below the cut-off')
})

/* -------------------------------------------------------------------- flight */

heading('Reconstructing the flight')

const GRAVITY = 2.8

check('the apex is recovered from a clean toss', () => {
  const shots = tossFrames({ apexT: 0.45, apexY: 0.16, gravity: GRAVITY, x0: 0.45, driftX: 0.05 })
  const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY })
  assert(flight !== undefined, 'no flight found on a clean toss')
  note(`apex t=${flight!.apex.t.toFixed(3)}s y=${flight!.apex.y.toFixed(3)} conf ${flight!.confidence.toFixed(2)}`)
  near(flight!.apex.t, 0.45, 0.05, 'apex time')
  near(flight!.apex.y, 0.16, 0.02, 'apex height')
  near(flight!.apex.x, 0.45 + 0.05 * 0.45, 0.03, 'apex x')
  within(flight!.confidence, 0.45, 1, 'confidence on a clean toss')
})

check('the fitted curve predicts where the ball was between samples', () => {
  const shots = tossFrames({ apexT: 0.5, apexY: 0.14, gravity: GRAVITY, x0: 0.4, driftX: 0.06 })
  const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY })!
  let worst = 0
  for (const s of shots) {
    const truth = s.truth.y
    worst = Math.max(worst, Math.abs(flightHeightAt(flight, s.t) - truth))
  }
  note(`worst height error across the flight: ${worst.toFixed(4)} of frame height`)
  within(worst, 0, 0.015, 'flight prediction error')
})

check('a ball lost for several frames is still tracked', () => {
  // Behind the player's arm, or washed out against a bright patch of sky.
  const shots = tossFrames({ apexT: 0.45, apexY: 0.16, gravity: GRAVITY, x0: 0.45, driftX: 0.05 })
  const gapped = shots.map((s, i) => (i >= 8 && i <= 12 ? { ...s, bitmap: render([], 900 + i) } : s))
  const flight = trackBall(candidatesFor(gapped), { expectedGravity: GRAVITY })
  assert(flight !== undefined, 'lost the ball entirely over a five-frame gap')
  near(flight!.apex.y, 0.16, 0.03, 'apex height across a gap')
})

check('slow motion is tracked as well as normal speed', () => {
  for (const fps of [30, 60, 120]) {
    const shots = tossFrames({
      apexT: 0.45, apexY: 0.16, gravity: GRAVITY, x0: 0.45, driftX: 0.05, fps,
    })
    const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY })
    assert(flight !== undefined, `no flight at ${fps} fps`)
    near(flight!.apex.y, 0.16, 0.025, `apex height at ${fps} fps`)
  }
})

/**
 * A recreational clip is not the tripod-steady, 30fps-plus footage the other
 * cases here use — it can be a phone at 15 or 12fps with the shutter open
 * long enough to smear a fast-moving ball into a streak. `elongation` and
 * `fill` in `findCandidates`, and `gravityTolerance`/`inlierBand` in
 * `trackBall`, were checked against exactly this by pushing a synthetic toss
 * to the blurriest a real shutter gets — a full frame interval of exposure;
 * any longer and the next frame would double-expose — at several seeds down
 * to 12fps: some individual frames lose their candidate to the elongation
 * cutoff, same as a clean clip loses frames to occlusion, but RANSAC
 * recovers the flight from whatever survives, the same way it already copes
 * with a mid-flight gap above. The fit still lands within the app's own
 * confidence floor for using a toss reading (0.45).
 *
 * (10fps and below was also tried, and is genuinely too sparse: a 0.9s toss
 * samples down to eight or nine frames total, and losing even a few of those
 * to blur leaves too little for either a curve fit or a person to trust — no
 * threshold here fixes there not being enough frames. That is a real limit,
 * not a bug, so it is not asserted on.)
 */
check('a blurry, low frame-rate toss is still tracked', () => {
  for (const fps of [15, 12]) {
    for (const seed of [7, 41, 103]) {
      const shots = tossFrames({
        apexT: 0.45,
        apexY: 0.16,
        gravity: GRAVITY,
        x0: 0.45,
        driftX: 0.05,
        fps,
        blurExposure: 1.0,
        noise: 10,
        seed,
      })
      const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY })
      assert(flight !== undefined, `lost a toss blurred by a full frame interval at ${fps} fps (seed ${seed})`)
      note(`${fps} fps blurred, seed ${seed}: apex y=${flight!.apex.y.toFixed(3)} conf=${flight!.confidence.toFixed(2)}`)
      near(flight!.apex.y, 0.16, 0.04, `apex height at ${fps} fps, blurred, seed ${seed}`)
      within(
        flight!.confidence,
        0.45,
        1,
        `confidence at ${fps} fps, blurred, seed ${seed}, must still clear the app's floor`,
      )
    }
  }
})

/* -------------------------------------------------------------- false alarms */

heading('Not mistaking other things for the ball')

check('a ball-sized object crossing the frame in a straight line is rejected', () => {
  // The failure a colour threshold makes on its own: something small, bright and
  // moving that is not falling. It has no curvature, so the free-fall constraint
  // is the only thing standing between it and being reported as a toss.
  const shots = Array.from({ length: 24 }, (_, i) => {
    const t = i / 30
    return {
      t,
      bitmap: render([{ x: 0.1 + t * 0.8, y: 0.3, r: 0.011, colour: BALL }], 500 + i * 31),
    }
  })
  const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY })
  assert(flight === undefined, 'a straight-line mover was reported as a toss')
})

check('an object rising the whole time is rejected', () => {
  const shots = Array.from({ length: 24 }, (_, i) => {
    const t = i / 30
    return {
      t,
      bitmap: render([{ x: 0.45, y: 0.5 - t * 0.35, r: 0.011, colour: BALL }], 600 + i * 37),
    }
  })
  assert(
    trackBall(candidatesFor(shots), { expectedGravity: GRAVITY }) === undefined,
    'something that only went up was reported as a toss',
  )
})

check('the real ball is picked out from among distractors', () => {
  // Two decoys moving in straight lines alongside the genuine toss: someone
  // else's ball rolling along a fence line, a bird.
  const shots = tossFrames({
    apexT: 0.45,
    apexY: 0.16,
    gravity: GRAVITY,
    x0: 0.45,
    driftX: 0.05,
    extra: (t) => [
      { x: 0.1 + t * 0.5, y: 0.22, r: 0.011, colour: BALL },
      { x: 0.85 - t * 0.4, y: 0.4, r: 0.01, colour: BALL },
    ],
  })
  const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY })
  assert(flight !== undefined, 'lost the ball among the distractors')
  near(flight!.apex.y, 0.16, 0.03, 'apex height with distractors present')
  near(flight!.apex.t, 0.45, 0.06, 'apex time with distractors present')
})

check('a flight with the wrong gravity for the scale is rejected', () => {
  // Same parabola, but the caller says the player is a different size — so this
  // curvature cannot be a ball at that distance. Guards against fitting an arc
  // to something much nearer or further away than the player.
  const shots = tossFrames({ apexT: 0.45, apexY: 0.16, gravity: GRAVITY, x0: 0.45, driftX: 0.05 })
  const flight = trackBall(candidatesFor(shots), { expectedGravity: GRAVITY * 6 })
  assert(flight === undefined, 'accepted a flight six times off the expected gravity')
})

check('too few frames to be sure produces nothing', () => {
  const shots = tossFrames({
    apexT: 0.1, apexY: 0.16, gravity: GRAVITY, x0: 0.45, driftX: 0.05, duration: 0.12,
  })
  assert(
    trackBall(candidatesFor(shots), { expectedGravity: GRAVITY }) === undefined,
    'claimed a flight from a handful of frames',
  )
})

/* --------------------------------------------- fits that are not measurements */

/**
 * These last cases hand `trackBall` its detections directly instead of rendering
 * pixels for them. That is not a shortcut. Both failures live in the arithmetic
 * after RANSAC has already agreed on a set of inliers, and reproducing them
 * through the renderer would mean hunting for a scene whose blob centroids
 * happen to land where the arithmetic goes wrong — a fixture that says nothing
 * about the bug and breaks the moment the detector's thresholds move. Stated as
 * detections, each one is exactly the geometry it is about.
 */
heading('Fits that describe nothing that was seen')

const detections = (pts: { t: number; y: number; x?: number }[]) =>
  pts.map((p) => ({ t: p.t, candidates: [{ x: p.x ?? 0.45, y: p.y, r: 0.011, score: 1 }] }))

const BEND_APEX_Y = 0.14

/**
 * A run of detections that all sit inside `inlierBand` of a seed whose curvature
 * is legal, but which lean high at the ends of the flight and low through the
 * middle — the signature of centroids pulled about by motion blur. RANSAC seeds
 * on three of the outer ones and takes the lot, and the least-squares curve
 * through all of them bends far harder than a ball at this scale can.
 *
 * Taken at two lengths below, because how hard it bends is not the only thing
 * that decides whether it is caught: the gravity gate widens with the fit's own
 * error bars, and those grow without limit as the track shortens.
 */
const leaningArc = (n: number, perturb: boolean) => {
  const apexT = 0.4
  const c2 = 2.1 // g = 4.2, inside the ±55% band around 2.8
  const lean = 0.009 // ±this is 0.018 apart, inside the 0.022 inlier band
  const half = (n - 1) / 30 / 2
  return detections(
    Array.from({ length: n }, (_, i) => {
      const t = apexT - half + i / 30
      const rt = t - apexT
      // Sign flips where t² crosses its own mean, which is where a residual
      // does the most to the fitted curvature per unit of residual.
      const w = perturb ? (Math.abs(rt) > half / Math.sqrt(3) ? lean : -lean) : 0
      return { t, y: BEND_APEX_Y + c2 * rt * rt + w }
    }),
  )
}

check('a refit dragged outside the gravity band is rejected', () => {
  // The control matters as much as the case: the same arc without the lean is
  // accepted, so the rejection below can only be the drifted curvature.
  const clean = trackBall(leaningArc(15, false), { expectedGravity: GRAVITY })
  assert(clean !== undefined, 'the unperturbed control arc was rejected')
  near(clean!.apex.y, BEND_APEX_Y, 0.01, 'control apex height')

  assert(
    trackBall(leaningArc(15, true), { expectedGravity: GRAVITY }) === undefined,
    'a refit at g = 5.0 was reported, having been gated only on its seed at 4.2',
  )
})

check('the same bend is rejected on a track too short to measure a curvature', () => {
  // The gravity gate widens by three standard errors of the fitted curvature, and
  // at six detections over a sixth of a second that term ran past the expected
  // gravity itself — an allowance wider than the quantity it is an allowance on,
  // which excuses every positive curvature there is. This same bend came back at
  // 3.2× the gravity the image scale implies, with the apex four thousandths of a
  // frame height low and confidence 0.43 — near enough to `analyze.ts`'s 0.45
  // floor that a slightly gentler lean clears it and is read out as a toss.
  const bent = trackBall(leaningArc(6, true), { expectedGravity: GRAVITY })
  note(
    `six-detection bend: ${bent ? `g=${(2 * bent.coefficients[2] / GRAVITY).toFixed(2)}× expected at conf ${bent.confidence.toFixed(2)}` : 'rejected'} (was g=3.15× expected at conf 0.43)`,
  )
  assert(bent === undefined, 'a refit at 3.2x the expected gravity was reported from six detections')

  // And the short control still passes, so what was bounded is the tolerance and
  // not the shortest track's right to be measured at all.
  const clean = trackBall(leaningArc(6, false), { expectedGravity: GRAVITY })
  assert(clean !== undefined, 'the unperturbed six-detection control arc was rejected')
  near(clean!.apex.y, BEND_APEX_Y, 0.01, 'six-detection control apex height')
})

check('an ascending-only track is not reported from an extrapolated apex', () => {
  // The ball leaves the top of the frame, or is lost against bright sky before
  // it turns over. The curvature is exactly right, every point is on the curve,
  // and the vertex is 0.4s past the last thing anyone saw — at y = −0.2, which
  // is above the top of the frame. Reporting that would tell the player their
  // toss peaked a fifth of a frame height off-screen.
  const vertexT = 0.9
  const vertexY = -0.2
  const rising = detections(
    Array.from({ length: 16 }, (_, i) => {
      const t = i / 30
      return { t, y: vertexY + (GRAVITY / 2) * (t - vertexT) ** 2 }
    }),
  )
  assert(
    trackBall(rising, { expectedGravity: GRAVITY }) === undefined,
    'reported an apex 0.4s and a whole frame edge beyond anything sampled',
  )
})

check('an apex a fraction of a frame past the last sample is still allowed', () => {
  // The other side of the same constraint. A real toss seldom puts a detection
  // exactly on its turning point, and the last frame before the ball is lost is
  // often just short of it; nudging the vertex barely outside the window must
  // not cost the player their two toss numbers.
  const vertexT = 0.5 + 0.5 / 30
  const vertexY = 0.15
  const flight = trackBall(
    detections(
      Array.from({ length: 16 }, (_, i) => {
        const t = i / 30
        return { t, y: vertexY + (GRAVITY / 2) * (t - vertexT) ** 2 }
      }),
    ),
    { expectedGravity: GRAVITY },
  )
  assert(flight !== undefined, 'rejected an apex half a frame past the last sample')
  near(flight!.apex.t, vertexT, 0.02, 'apex time just past the window')
  near(flight!.apex.y, vertexY, 0.01, 'apex height just past the window')
})

/* --------------------------------------- gates measured against a noisy detector */

/**
 * The cases above are single fits with an obvious right answer. A rejection gate
 * is not that kind of thing: it is a threshold on a noisy quantity, and the only
 * question worth asking of one is what fraction of good tosses it throws away.
 * Asked that way, both gates here were once badly mistuned in the direction that
 * costs a player everything — the app reports no toss feedback at all and never
 * says why — and neither mistuning is visible from any single fit.
 *
 * So these run the same toss a few hundred times with fresh centroid noise and
 * count. Detections rather than rendered pixels, for the same reason as the
 * section above, plus one more: the acceptance rate has to move with the noise
 * and nothing else, and a renderer puts the detector's own thresholds in the way
 * of that. The noise is stated in pixels of the frame above so it can be argued
 * with — a blob centroid on a ball a few pixels across is good to about one.
 */
heading('Gates measured against a noisy detector')

/** One pixel of the frame the renderer above draws, as a fraction of its height. */
const PIXEL = 1 / H

/** Box–Muller on the seeded stream: centroid error is a sum of many small pushes. */
function normal(rand: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand())
}

function noisyTrack(opts: {
  samples: number
  fps: number
  apexT: number
  apexY: number
  gravity: number
  noisePx: number
  seed: number
  /**
   * Systematic lag in the measured centroid, in frames. A motion-blurred ball
   * smears backwards along its travel, so its centroid sits behind the true
   * position by a fraction of the distance covered in one exposure — which is a
   * bias proportional to vertical speed, and a bias proportional to speed slides
   * the fitted vertex in time without touching anything else about the fit.
   */
  blurLagFrames?: number
  /** Keep only every nth detection, leaving the other frames ball-less. */
  keepEvery?: number
}) {
  const rand = seeded(opts.seed)
  const sigma = opts.noisePx * PIXEL
  const lag = (opts.blurLagFrames ?? 0) / opts.fps
  return Array.from({ length: opts.samples }, (_, i) => {
    const t = i / opts.fps
    const rt = t - opts.apexT - lag
    const y = opts.apexY + 0.5 * opts.gravity * rt * rt + normal(rand) * sigma
    const x = 0.45 + 0.05 * t + normal(rand) * sigma
    const found = !opts.keepEvery || i % opts.keepEvery === 0
    return { t, candidates: found ? [{ x, y, r: 0.011, score: 1 }] : [] }
  })
}

/** Fraction of runs `trackBall` returns a flight for, and how good those were. */
function acceptance(
  trials: number,
  gravity: number,
  build: (seed: number) => ReturnType<typeof noisyTrack>,
  trueApexY: number,
) {
  let accepted = 0
  let apexError = 0
  let softest = 1
  for (let i = 0; i < trials; i++) {
    const flight = trackBall(build(1000 + i * 7919), { expectedGravity: gravity })
    if (!flight) continue
    accepted++
    apexError += Math.abs(flight.apex.y - trueApexY)
    softest = Math.min(softest, flight.confidence)
  }
  return {
    rate: accepted / trials,
    apexError: accepted ? apexError / accepted : Infinity,
    softest: accepted ? softest : 0,
  }
}

/**
 * `assessBall` derives `expectedGravity` from the player's measured height, so a
 * player standing at the far end of the too-far cutoff (0.30) is the smallest
 * legal scale and the shortest usable track. 0.32 is just inside it.
 */
const FAR_PLAYER_GRAVITY = (9.81 * 0.32) / 1.78

check('a short track is not rejected for a curvature it could never have measured', () => {
  // Five detections over 0.13s is the minimum this function advertises. A ball
  // at this scale falls about four millimetres of image across the whole window
  // — under the centroid noise — so its curvature is not measured at all, and a
  // fixed ±55% band is narrower than the fit's own noise floor. Gating on that
  // band alone rejected roughly a third of these outright.
  const track = (noisePx: number) => (seed: number) =>
    noisyTrack({
      samples: 5, fps: 30, apexT: 2 / 30, apexY: 0.3, gravity: FAR_PLAYER_GRAVITY, noisePx, seed,
    })

  const clean = acceptance(400, FAR_PLAYER_GRAVITY, track(1), 0.3)
  const rough = acceptance(400, FAR_PLAYER_GRAVITY, track(2), 0.3)
  note(`far player, 5 samples/0.13s: 1px noise ${(clean.rate * 100).toFixed(0)}% accepted (was 58%), 2px ${(rough.rate * 100).toFixed(0)}% (was 28%)`)
  note(`apex height error on the accepted fits: ${(clean.apexError / 0.32 * 178).toFixed(1)} cm at 1px, ${(rough.apexError / 0.32 * 178).toFixed(1)} cm at 2px`)

  within(clean.rate, 0.8, 1, 'acceptance of a legal short track at 1px of centroid noise')
  within(rough.rate, 0.5, 1, 'acceptance of a legal short track at 2px of centroid noise')
  // The whole argument for accepting these: what was being thrown away was
  // accurate. Expressed in body heights, which is the unit the toss metrics
  // report in, and then in centimetres of a 1.78 m player.
  within(clean.apexError / 0.32, 0, 0.02, 'apex height error, in body heights, at 1px')
  within(rough.apexError / 0.32, 0, 0.03, 'apex height error, in body heights, at 2px')
})

check('an apex a frame past the last detection survives the noise that put it there', () => {
  // The nominal allowance was one sampling interval, but a vertex time's error
  // comes from centroid noise, span and curvature — not from sample spacing. A
  // vertex genuinely one interval past the last detection, with the blur lag a
  // real shutter adds, was rejected three runs in four.
  const track = (past: number) => (seed: number) =>
    noisyTrack({
      samples: 13, fps: 30, apexT: 12 / 30 + past / 30, apexY: 0.15,
      gravity: GRAVITY, noisePx: 2, seed, blurLagFrames: 0.3,
    })

  const full = acceptance(400, GRAVITY, track(1), 0.15)
  const half = acceptance(400, GRAVITY, track(0.5), 0.15)
  note(`apex past the last sample: +1.0 interval ${(full.rate * 100).toFixed(0)}% accepted (was 26%), +0.5 ${(half.rate * 100).toFixed(0)}% (was 65%)`)
  within(full.rate, 0.55, 1, 'acceptance with the vertex one interval past the last sample')
  within(half.rate, 0.85, 1, 'acceptance with the vertex half an interval past')
  // Accepted at reduced confidence rather than waved through: the softening is
  // the point of the widened gate, but it must not soften so hard that every
  // one of these lands under the 0.45 floor `assessBall` drops the ball at.
  note(`softest confidence among the accepted: ${full.softest.toFixed(2)}`)
  within(full.softest, 0.45, 1, 'confidence of the least convincing accepted fit')
})

check('a longer, cleaner track is not given a smaller apex allowance', () => {
  // The vertex a quarter of a sampling interval past the last detection, which
  // at this curvature leaves the ball four hundredths of a pixel below its own
  // turning point — an extrapolation of nothing. Scaled by the vertex's standard
  // error alone the allowance shrinks as the track lengthens and its residuals
  // tighten, so the gate rejected hardest exactly where the evidence was best:
  // 40 detections were thrown out nine times in ten, 15 of them never.
  const track = (samples: number) => (seed: number) =>
    noisyTrack({
      samples, fps: 32, apexT: (samples - 1) / 32 + 0.25 / 32, apexY: 0.15,
      gravity: GRAVITY, noisePx: 1, seed,
    })

  const short = acceptance(150, GRAVITY, track(15), 0.15)
  const long = acceptance(150, GRAVITY, track(40), 0.15)
  note(`vertex a quarter-interval past: 15 detections ${(short.rate * 100).toFixed(0)}% accepted (was 100%), 40 detections ${(long.rate * 100).toFixed(0)}% (was 9%)`)
  assert(
    long.rate >= short.rate,
    `a 40-detection track was accepted ${(long.rate * 100).toFixed(0)}% against a 15-detection one at ${(short.rate * 100).toFixed(0)}% — more evidence still bought a narrower gate`,
  )
  within(long.rate, 0.95, 1, 'acceptance of a long track whose vertex barely overshoots')

  // The confidence term measured the same overshoot in the same shrinking units,
  // so the fits that did survive were docked hardest for the least extrapolation
  // — and these are accurate fits, landing well inside half a pixel of the true
  // apex. Docking them toward `analyze.ts`'s 0.45 floor costs the player the toss
  // numbers just as surely as rejecting them.
  note(`softest confidence among them: ${long.softest.toFixed(2)} (was 0.74), apex height error ${(long.apexError / PIXEL).toFixed(2)} px`)
  within(long.softest, 0.8, 1, 'confidence of a long clean track with a negligible overshoot')
})

check('losing half the detections buys less extrapolation, not more', () => {
  // Alternating motion blur finds the ball on every other frame. The gaps are
  // then uniformly one frame wide, so the detections' own median gap *is* the
  // sparse interval — and an allowance counted in median gaps handed the
  // half-evidence track double the licence of the fully tracked one.
  const track = (keepEvery?: number) => (seed: number) =>
    noisyTrack({
      samples: 25, fps: 60, apexT: 24 / 60 + 1.6 / 60, apexY: 0.15,
      gravity: GRAVITY, noisePx: 1, seed, keepEvery,
    })

  const dense = acceptance(200, GRAVITY, track(), 0.15)
  const alternate = acceptance(200, GRAVITY, track(2), 0.15)
  note(`vertex 1.6 intervals past: fully tracked ${(dense.rate * 100).toFixed(0)}% accepted (was 6%), alternate frames ${(alternate.rate * 100).toFixed(0)}% (was 80%)`)
  assert(
    alternate.rate < dense.rate,
    `a half-tracked flight was accepted ${(alternate.rate * 100).toFixed(0)}% against the fully tracked ${(dense.rate * 100).toFixed(0)}% — sparser evidence still bought more licence`,
  )
  within(dense.rate, 0.3, 1, 'acceptance of a fully tracked flight whose vertex just overshoots')
  within(alternate.rate, 0, 0.25, 'acceptance of the same flight with half the detections')
})

/* ------------------------------------------------- missed, and mistaken -- */

/**
 * R11 in NEXT.md. Everything above pins individual gates against individual
 * scenarios — a short track, a late vertex, a specific decoy. None of it adds
 * up to a rate, and a rate is what the question actually asks: across many
 * independent clips, how often is a real toss missed, and how often is
 * something that was never a toss reported as one? Both are ensembles over
 * many seeds for the same reason the noise ensembles elsewhere in this suite
 * are — a single trial answers "did this one work", not "how often does it".
 */
heading('How often the toss is missed, and how often something else is found')

check('an ordinarily filmed toss is missed only rarely, not routinely', () => {
  // Not one of the edge cases above, tuned to a specific gate: the pose grid's
  // own cap (`FINE_FPS`, 32) for close to the span a toss actually spends in
  // the air, at the centroid noise the short-track check above already
  // established as realistic for a clean daylight clip.
  const track = (seed: number) =>
    noisyTrack({ samples: 18, fps: 32, apexT: 9 / 32, apexY: 0.2, gravity: GRAVITY, noisePx: 1.5, seed })
  const result = acceptance(500, GRAVITY, track, 0.2)
  note(
    `ordinary toss, 18 samples at 32 fps, 1.5 px centroid noise: found in ${(result.rate * 100).toFixed(1)}% of 500 trials, missed in ${((1 - result.rate) * 100).toFixed(1)}%`,
  )
  within(result.rate, 0.9, 1, 'the false-negative rate on an ordinarily filmed toss')
})

/**
 * Started as a stress test and found a real gap. Every candidate in these
 * frames is an independent random point with no relationship to the one
 * before it — not something a real camera produces, but a sharp probe of the
 * search on its own terms: with `n` points there are `n`-choose-3 candidate
 * curves, and before `X_CONSISTENCY_BAND` existed `fitQuadratic` gated on
 * curvature alone, so trying thousands of hypotheses against a small pool
 * found *some* triple whose curvature landed in the gravity band by chance
 * more often than not — 85% of these 300 trials, on the first run of this
 * check. Requiring the inliers to also agree on a straight line sideways,
 * which a stitched-together fit across unrelated points essentially never
 * does by coincidence, took that to zero. Kept as a regression check on the
 * search itself, now that there is a real number behind it rather than an
 * assumption.
 */
check('fully decorrelated noise is not stitched into a false toss', () => {
  const trials = 300
  let falsePositives = 0
  for (let i = 0; i < trials; i++) {
    const rand = seeded(9000 + i * 7919)
    const perFrame = Array.from({ length: 24 }, (_, k) => ({
      t: k / 30,
      candidates: Array.from({ length: 2 }, () => ({
        x: rand(),
        y: rand() * 0.6,
        r: 0.008 + rand() * 0.02,
        score: rand(),
      })),
    }))
    if (trackBall(perFrame, { expectedGravity: GRAVITY })) falsePositives++
  }
  const rate = falsePositives / trials
  note(`fully decorrelated noise reported as a toss in ${(rate * 100).toFixed(1)}% of ${trials} trials (was 85% before X_CONSISTENCY_BAND)`)
  within(rate, 0, 0.05, 'the false-positive rate on fully decorrelated noise')
})

check('two or three background objects, each moving smoothly, are still rejected in the overwhelming majority of clips', () => {
  // The realistic version of the check above: not fresh independent points
  // every frame, but a small number of distinct things — another player's
  // ball, a bird, a bright reflection — each on its own smooth path, which is
  // what a real background actually offers a detector that does not know it
  // is clutter. Straight lines and constant-ish drifts, per the decoys `ball
  // is picked out from among distractors` above already uses, but here there
  // is no genuine ball in the frame at all: everything the tracker sees is a
  // decoy, so any accepted flight is a false positive by construction.
  const trials = 300
  let falsePositives = 0
  for (let i = 0; i < trials; i++) {
    const rand = seeded(13000 + i * 7919)
    const decoys = Array.from({ length: 2 + (i % 2) }, () => ({
      x0: rand(),
      y0: rand() * 0.5,
      vx: (rand() - 0.5) * 1.0,
      vy: (rand() - 0.5) * 0.5,
    }))
    const perFrame = Array.from({ length: 24 }, (_, k) => {
      const t = k / 30
      return {
        t,
        candidates: decoys.map((d) => ({ x: d.x0 + d.vx * t, y: d.y0 + d.vy * t, r: 0.011, score: 1 })),
      }
    })
    if (trackBall(perFrame, { expectedGravity: GRAVITY })) falsePositives++
  }
  const rate = falsePositives / trials
  note(`two or three independently-drifting background objects reported as a toss in ${(rate * 100).toFixed(1)}% of ${trials} trials`)
  // 24% before X_CONSISTENCY_BAND in ballTrack.ts existed; tightening that gate
  // further starts rejecting genuine tosses filmed among real distractors — see
  // its own comment. This is the validated floor, not a target chosen in
  // advance, and the ratchet is here so a future change cannot silently widen
  // the gap back towards where it started.
  within(rate, 0, 0.1, 'the false-positive rate on realistic multi-object clutter')
})

check('a single randomly-moving object — a bird, a second ball, a reflection — is rejected far more often than not', () => {
  // A generalisation of "a ball-sized object crossing the frame in a straight
  // line is rejected" and "an object rising the whole time is rejected" above,
  // over many random directions and starting points rather than the one each
  // of those names. A straight-line mover has no curvature to speak of, so the
  // gravity gate is expected to reject nearly all of these — the point of
  // measuring it is to say how nearly, and to notice if that ever changes.
  const trials = 300
  let falsePositives = 0
  for (let i = 0; i < trials; i++) {
    const rand = seeded(11000 + i * 7919)
    const vx = (rand() - 0.5) * 1.2
    const vy = (rand() - 0.5) * 0.6
    const x0 = rand()
    const y0 = rand() * 0.5
    const perFrame = Array.from({ length: 24 }, (_, k) => {
      const t = k / 30
      return { t, candidates: [{ x: x0 + vx * t, y: y0 + vy * t, r: 0.011, score: 1 }] }
    })
    if (trackBall(perFrame, { expectedGravity: GRAVITY })) falsePositives++
  }
  const rate = falsePositives / trials
  note(`a single randomly-moving object alone is reported as a toss in ${(rate * 100).toFixed(1)}% of ${trials} trials`)
  within(rate, 0, 0.05, 'the false-positive rate on one non-parabolic mover')
})

/* ------------------------------------------ the ball after it has been hit */

/**
 * Everything above renders the toss straight in frame-normalised coordinates,
 * because a toss goes up and comes down in roughly the plane the camera is
 * looking at and nothing is gained by pretending otherwise. The struck ball
 * cannot be drawn that way. It leaves the frame — that is the entire finding
 * below — and *when* it leaves depends on where the phone was standing, how far
 * back, and how fast the serve was. Those are the three things a player
 * controls, so the model has to contain them or the answer is unfalsifiable.
 *
 * So this projects. Camera at the origin looking along +X at the player, +Y up,
 * +Z down the court; the focal length is set so the player's 1.78 m at the
 * stated distance spans the stated fraction of frame height, which is exactly
 * the relation `findBall` uses to turn `bodyHeight` into an expected gravity.
 * A sanity check on the whole construction: at four metres with the player
 * filling 0.6 of the height it draws the ball at r = 0.0113, and the toss cases
 * above draw it at 0.011 by hand.
 *
 * Still synthetic pixels, and the header of this file applies unchanged — this
 * pins what geometry forces, not what a real court does. But the quantity that
 * matters here is a duration in milliseconds, and that comes from the
 * projection rather than from the renderer, so it is the one number in this file
 * that a real clip cannot argue with very much.
 */
const STANDING_M = 1.78
const BALL_RADIUS_M = 0.0335
/** Camera height. A phone on a bag or a low tripod, not head height. */
const CAM_Y = 1.3
/** Contact happens about 1.43 standing heights up, which is what `anatomy.ts` expects. */
const CONTACT_HEIGHTS = 1.43

interface Struck {
  /** How far the phone stood from the player, in metres. */
  cameraM: number
  /** The player's standing height as a fraction of frame height. */
  bodyHeight: number
  speedKmh: number
  /** Degrees below horizontal. A flat serve leaves a few degrees down. */
  elevationDeg: number
  /** Degrees of the ball's travel pointing away from the camera, not across it. */
  azimuthDeg: number
  /**
   * How far the phone is tilted up, in degrees. A phone propped on a bag to fit
   * the racket in the top of the shot is doing this, and `spatial.ts` measures
   * roll and yaw but not pitch — so unlike roll, nothing downstream can correct
   * for it. The framing is held fixed as this changes, so what it measures here
   * is the effect on the launch angle alone and not a different crop.
   */
  pitchDeg?: number
  /** Samples per second of REAL time — not the pose grid, which caps at 32. */
  hz: number
  /** Fraction of the sampling interval the shutter is open for. */
  exposure: number
  /** Where across the frame contact happens; the ball travels towards x = 1. */
  contactX: number
  seed?: number
  noise?: number
}

function struckFrames(o: Struck) {
  const fh = (o.cameraM * o.bodyHeight) / STANDING_M
  const fw = fh / (W / H)
  // Feet on the ground at 0.92 of the frame, which is where a player framed head
  // to feet with room above the racket actually sits.
  const cy0 = 0.92 - (fh * CAM_Y) / o.cameraM

  const v = o.speedKmh / 3.6
  const el = (o.elevationDeg * Math.PI) / 180
  const az = (o.azimuthDeg * Math.PI) / 180
  const vX = v * Math.cos(el) * Math.sin(az)
  const vY = -v * Math.sin(el)
  const vZ = v * Math.cos(el) * Math.cos(az)

  // Pitch rotates the camera about the axis the ball is travelling along, so it
  // cannot turn the ball's image direction the way roll does. What it does
  // instead is change the distance the perspective divides by. Both effects fall
  // out of the same two lines rather than being modelled separately.
  const p = ((o.pitchDeg ?? 0) * Math.PI) / 180
  const project = (t: number) => {
    const X = o.cameraM + vX * t
    const Yr = CONTACT_HEIGHTS * STANDING_M + vY * t - 0.5 * 9.81 * t * t - CAM_Y
    return { xc: X * Math.cos(p) + Yr * Math.sin(p), yc: -X * Math.sin(p) + Yr * Math.cos(p), Z: vZ * t }
  }
  // Held so that contact lands at the same place in frame whatever the pitch —
  // otherwise a tilted phone would be measuring a different crop as well as a
  // different angle, and the two could not be told apart.
  const contactY0 = cy0 - (fh * (CONTACT_HEIGHTS * STANDING_M - CAM_Y)) / o.cameraM
  const p0 = project(0)
  const cyPitched = contactY0 + (fh * p0.yc) / p0.xc

  const at = (t: number) => {
    const q = project(t)
    return {
      x: o.contactX + (fw * q.Z) / q.xc,
      y: cyPitched - (fh * q.yc) / q.xc,
      r: (fh * BALL_RADIUS_M) / q.xc,
    }
  }

  const dt = 1 / o.hz
  const shots: { t: number; bitmap: Bitmap; truth: { x: number; y: number; r: number } }[] = []
  // Bounded well above anything the geometry allows, so a mistake in the model
  // shows up as a failed assertion rather than as a hung suite.
  for (let i = 1; i <= 200; i++) {
    const t = i * dt
    const p = at(t)
    if (p.x < 0.01 || p.x > 0.99 || p.y < 0.005 || p.y > 0.99) break
    const prev = at(t - dt)
    const dxs = (p.x - prev.x) * (W / H)
    const dys = p.y - prev.y
    shots.push({
      t,
      bitmap: render(
        [
          {
            x: p.x,
            y: p.y,
            r: p.r,
            colour: BALL,
            smear: { dx: dxs, dy: dys, len: Math.hypot(dxs, dys) * H * o.exposure },
          },
        ],
        (o.seed ?? 5000) + i * 977,
        o.noise ?? 6,
      ),
      truth: p,
    })
  }
  return { shots, at, contact: at(0) }
}

const struckBase: Struck = {
  cameraM: 4,
  bodyHeight: 0.6,
  speedKmh: 120,
  elevationDeg: 5,
  azimuthDeg: 0,
  hz: 240,
  exposure: 1,
  contactX: 0.3,
  noise: 6,
}

/** Detections that landed within three ball radii of where the ball really was. */
function outboundDetections(o: Struck) {
  const { shots, contact } = struckFrames(o)
  const perFrame = shots.map((s, i) => ({
    t: s.t,
    candidates: findCandidates(s.bitmap, i > 0 ? shots[i - 1].bitmap : undefined, {
      belowY: 0.62,
    }),
  }))
  let hits = 0
  let lagPx = 0
  for (let i = 0; i < shots.length; i++) {
    const truth = shots[i].truth
    const near = perFrame[i].candidates.find(
      (c) => Math.hypot((c.x - truth.x) * (W / H), c.y - truth.y) < 3 * Math.max(truth.r, 0.004),
    )
    if (!near) continue
    hits++
    lagPx += Math.hypot((near.x - truth.x) * (W / H), near.y - truth.y) * H
  }
  return {
    perFrame,
    contact,
    frames: shots.length,
    hits,
    visibleMs: shots.length ? shots[shots.length - 1].t * 1000 : 0,
    lagPx: hits ? lagPx / hits : NaN,
  }
}

heading('How long the struck ball is in the shot at all')

/**
 * The measurement the rest of this section exists to serve, and the one that
 * decided whether any of it ships. It is not about detection: it is about the
 * ball leaving the picture.
 */
check('the ball is out of frame within a few tens of milliseconds', () => {
  const seen: Record<number, number> = {}
  for (const speedKmh of [80, 100, 120, 140, 160]) {
    const m = outboundDetections({ ...struckBase, speedKmh })
    seen[speedKmh] = m.visibleMs
    note(`${speedKmh} km/h: in frame for ${m.visibleMs.toFixed(0)} ms (${m.frames} frames at 240 Hz)`)
  }
  // At club pace the whole outbound flight this app could ever see is under a
  // fifteenth of a second. Everything downstream — the sampling rate, the seek
  // budget, the five-sample minimum — is a consequence of this line.
  within(seen[120], 20, 60, 'milliseconds the ball is in shot at 120 km/h')
  assert(
    seen[160] < seen[80],
    `a faster serve should leave sooner: 160 km/h stayed ${seen[160].toFixed(0)} ms against 80 km/h at ${seen[80].toFixed(0)} ms`,
  )
})

check('filming closer makes the outbound ball less measurable, not more', () => {
  // Worth pinning because it is the opposite of the advice everything else in
  // this app gives. Every body measurement improves as the player fills more of
  // the frame; the struck ball is the one quantity that gets worse, because the
  // same metres of travel cross more of the picture.
  const spans: [number, number][] = []
  for (const cameraM of [3, 4, 6, 8]) {
    // Framed the same way each time — stepping back shrinks the player.
    const bodyHeight = (0.6 * 4) / cameraM
    const m = outboundDetections({ ...struckBase, cameraM, bodyHeight })
    spans.push([cameraM, m.visibleMs])
    note(`${cameraM} m (player ${bodyHeight.toFixed(2)} of frame): ${m.visibleMs.toFixed(0)} ms, ${m.hits}/${m.frames} detected`)
  }
  for (let i = 1; i < spans.length; i++) {
    assert(
      spans[i][1] > spans[i - 1][1],
      `stepping back from ${spans[i - 1][0]} m to ${spans[i][0]} m should lengthen the window, not shorten it`,
    )
  }
})

/**
 * And so: at what sampling rate is there anything to fit?
 *
 * `exposure: 1` is a shutter open for the whole frame interval, which is what
 * the toss cases above already call "about as blurry as ordinary video gets".
 * It is the honest default here because the ball is at its fastest, so it is the
 * frame rate and the shutter together that decide this, not either alone.
 */
check('ordinary frame rates do not resolve the outbound ball at all', () => {
  const counts: Record<number, { hits: number; frames: number }> = {}
  for (const hz of [30, 60, 120, 240, 480]) {
    const m = outboundDetections({ ...struckBase, hz })
    counts[hz] = { hits: m.hits, frames: m.frames }
    note(`${String(hz).padStart(3)} Hz: ${m.hits} of ${m.frames} frames resolved, centroid lag ${m.lagPx.toFixed(1)} px`)
  }
  // The finding, asserted rather than left in a note: a phone shooting 30 or 60
  // frames a second has one or two frames of struck ball, and a full-interval
  // shutter smears those past the detector's elongation cutoff. There is no
  // threshold anywhere in this file that recovers a measurement from that, which
  // is why `findOutbound` samples at 240 Hz and returns nothing when the clip
  // cannot supply it.
  assert(counts[30].hits < 5, `30 Hz resolved ${counts[30].hits} frames — the refusal below is no longer earned`)
  assert(counts[60].hits < 5, `60 Hz resolved ${counts[60].hits} frames`)
  assert(counts[240].hits >= 5, `240 Hz resolved only ${counts[240].hits} frames, which is under the five a line is fitted from`)
})

check('a short shutter is what buys the frames back, and most clips do not have one', () => {
  // Same geometry, shutter open a quarter of the interval — bright sun, or a
  // phone in a high-frame-rate mode that shortens exposure to keep up. The
  // window in milliseconds is unchanged, so 30 Hz still only contains one or two
  // frames of ball: a faster shutter cannot manufacture film that was not shot.
  for (const hz of [30, 60, 120, 240]) {
    const m = outboundDetections({ ...struckBase, hz, exposure: 0.25 })
    note(`${String(hz).padStart(3)} Hz, quarter-interval shutter: ${m.hits} of ${m.frames} resolved, lag ${m.lagPx.toFixed(1)} px`)
  }
  const slow = outboundDetections({ ...struckBase, hz: 30, exposure: 0.25 })
  assert(
    slow.hits < 5,
    `30 Hz with a fast shutter resolved ${slow.hits} frames — if this ever passes, the sampling rate is the wrong constraint`,
  )
})

/* -------------------------------------------- fitting the outbound flight */

heading('Fitting the outbound flight')

const ASPECT = W / H
/** 120 km/h is 33.3 m/s, and a body height is 1.78 m. */
const TRUE_SPEED_BH = 120 / 3.6 / STANDING_M

/**
 * The camera the rig renders, as `axes.ts` describes it.
 *
 * `azimuthDeg: 0` is dead side-on, which is 90° of yaw, and it is the only
 * geometry `outboundDetections` can produce. That matters more than it looks:
 * everything below used to compute its own `atan2(-vy, |vx * aspect|)`, which
 * equals what the app ships at 90° of yaw and at no other angle, because the
 * shipped reading divides the horizontal by the depth gain first. So the
 * -5.30° accuracy figure, the 0.221° pitch bound and the 8.00° roll result were
 * all measured on a function that was not the one in the report — a second copy
 * of the formula, and the one under test.
 *
 * There is one copy now. `readOutboundFlight` is exported from `analyze.ts` for
 * this and for nothing else, and `readAt` below is the only route from a track
 * to a speed or an angle in this file.
 */
const SIDE_ON = imageXSplit(90)

const readAt = (track: OutboundTrack, split = SIDE_ON) => {
  const read = readOutboundFlight(track, split, ASPECT, struckBase.bodyHeight)
  assert(read !== undefined, 'the shipped reading refused a track this rig produced')
  return read!
}

/** The toss fit's answer for where the ball was at contact, with its own error. */
const anchorFor = (c: { x: number; y: number }, missPx = 0) => ({
  t: 0,
  x: c.x + missPx / W,
  y: c.y,
})

check('speed and launch angle are recovered from a high-rate clip', () => {
  const m = outboundDetections(struckBase)
  const track = trackOutbound(m.perFrame, {
    anchor: anchorFor(m.contact),
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })
  assert(track !== undefined, 'no outbound track from nine clean detections')
  const { speed, launchAngle_deg: angle } = readAt(track!)
  note(
    `recovered ${speed.toFixed(2)} body heights/s against ${TRUE_SPEED_BH.toFixed(2)} true (${((speed / TRUE_SPEED_BH - 1) * 100).toFixed(1)}%), angle ${angle.toFixed(2)}° against -5°, conf ${track!.fitConfidence.toFixed(2)}`,
  )
  // Five percent, and it is worth saying what that is made of. The centroid of a
  // smeared ball sits behind the ball, which shifts every point along the track
  // by nearly the same amount and so barely touches the slope; what is left is
  // the pixel quantisation of a ball four pixels across.
  within(Math.abs(speed / TRUE_SPEED_BH - 1), 0, 0.05, 'fractional error in the recovered speed')
  near(angle, -5, 1.5, 'launch angle, degrees from horizontal')
  within(track!.fitConfidence, 0.6, 1, 'fit confidence on nine clean detections')
})

check('a ball receding from the camera reads slightly slow, and how slightly', () => {
  // The straight line is fitted in the image, and the image of a ball moving
  // away from the lens shrinks its own scale as it goes. Over the 33 ms this
  // window lasts the ball at 10 degrees of azimuth recedes about 20 cm out of
  // four metres, so the fit reports something near the middle of the window
  // rather than the speed off the strings. Measured here so the size of the
  // effect is on record rather than assumed small.
  const m = outboundDetections({ ...struckBase, azimuthDeg: 10 })
  const track = trackOutbound(m.perFrame, {
    anchor: anchorFor(m.contact),
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })
  assert(track !== undefined, 'lost the ball at 10 degrees of azimuth')
  const { speed } = readAt(track!)
  note(`10° azimuth: ${speed.toFixed(2)} body heights/s, ${((speed / TRUE_SPEED_BH - 1) * 100).toFixed(1)}% against the true 3D speed`)
  // Low, not high — projection and recession both only ever shorten. A reading
  // that came out fast would mean the model or the fit had a sign wrong.
  assert(speed < TRUE_SPEED_BH, `an oblique serve read ${speed.toFixed(2)}, above the true ${TRUE_SPEED_BH.toFixed(2)}`)
  within(TRUE_SPEED_BH - speed, 0, 0.12 * TRUE_SPEED_BH, 'how much an oblique serve loses to projection')
})

check('too few frames produces nothing rather than a slope', () => {
  for (const hz of [30, 60]) {
    const m = outboundDetections({ ...struckBase, hz })
    const track = trackOutbound(m.perFrame, {
      anchor: anchorFor(m.contact),
      aspect: ASPECT,
      bodyHeight: struckBase.bodyHeight,
    })
    assert(track === undefined, `fitted a serve speed to ${m.hits} detections at ${hz} Hz`)
  }
})

check('a fast straight mover that misses the contact point is rejected', () => {
  // The failure the anchor exists to prevent. A bird, a ball on the next court,
  // or the player's own racket head crossing the sky: small, bright, fast and
  // straight, which is every property the outbound fit tests for except one.
  const m = outboundDetections(struckBase)
  const shifted = anchorFor(m.contact, 0)
  const track = trackOutbound(m.perFrame, {
    // The same detections, told the ball was struck a fifth of a frame height
    // away from where this streak begins.
    anchor: { ...shifted, y: shifted.y + 0.2 },
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })
  assert(track === undefined, 'a streak that never passed through contact was reported as a serve')
})

check('where the anchor check actually starts refusing', () => {
  /*
   * `anchorFor` takes a `missPx` argument for exactly this and had never once
   * been called with it — seven call sites, every one at zero. So the toss
   * fit's extrapolation error at contact, which is what
   * `OUTBOUND_ANCHOR_TOLERANCE` says it is sized for, was never measured
   * against, and the constant's own doc-comment described an allowance nobody
   * had walked up to.
   *
   * Walking up to it: the operative limit is not the constant. The band and the
   * five-sample minimum bind first, because an anchor in the wrong place makes
   * the seed velocities wrong and the inlier count collapses before the miss
   * itself is ever tested. The check above uses a 0.2 shift, more than three
   * times the tolerance, where this has long since fired.
   *
   * Printed as a sweep rather than asserted at one value, because what matters
   * is that the constant's comment matches where the refusal happens, and a
   * future change to `OUTBOUND_BAND` moves it.
   */
  const m = outboundDetections(struckBase)
  const fits: number[] = []
  const refuses: number[] = []
  for (const missPx of [0, 5, 10, 15, 18, 20, 22, 26, 30]) {
    const track = trackOutbound(m.perFrame, {
      anchor: anchorFor(m.contact, missPx),
      aspect: ASPECT,
      bodyHeight: struckBase.bodyHeight,
    })
    ;(track ? fits : refuses).push(missPx)
  }
  const lastFit = Math.max(...fits)
  const firstRefusal = Math.min(...refuses)
  note(
    `  anchor miss: fits up to ${lastFit} px, refuses from ${firstRefusal} px ` +
      `(${(firstRefusal / H).toFixed(3)} frame heights against a stated tolerance of 0.06)`,
  )
  assert(fits.includes(0), 'the rig cannot fit its own serve with a perfect anchor')
  assert(refuses.length > 0, 'no anchor miss in the sweep was refused at all')
  assert(
    firstRefusal / H < 0.06,
    `the fit survived a ${(firstRefusal / H).toFixed(3)} miss, past OUTBOUND_ANCHOR_TOLERANCE — ` +
      'the constant is now the operative gate and its comment says it is not',
  )
})

check('a stalled clock is not a ball hanging in the air', () => {
  // What seeking a 30 fps clip at 240 Hz produces if the repeats are not
  // dropped: the same picture stamped with eight different times. Every point is
  // exactly on a horizontal line, the residuals are zero, and the anchor is a
  // few pixels away — a beautiful fit to a ball that left the strings at nought.
  const m = outboundDetections(struckBase)
  const frozen = m.perFrame.map((f) => ({ t: f.t, candidates: m.perFrame[0].candidates }))
  const track = trackOutbound(frozen, {
    anchor: anchorFor(m.contact),
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })
  assert(track === undefined, 'reported a serve speed from eight copies of one frame')
})

check('a repeated frame is recognised as one that did not advance', () => {
  // The cheaper half of the same defence, and the one that keeps the coverage
  // counts honest: a re-decode is bit-identical, so it scores exactly zero.
  const a = render([{ x: 0.4, y: 0.2, r: 0.011, colour: BALL }], 71)
  const b = render([{ x: 0.4, y: 0.2, r: 0.011, colour: BALL }], 71)
  const c = render([{ x: 0.5, y: 0.2, r: 0.011, colour: BALL }], 72)
  note(`identical ${frameChange(b, a).toFixed(3)}, moved ${frameChange(c, a).toFixed(3)}`)
  assert(frameChange(b, a) === 0, 'two identical frames did not score zero')
  assert(frameChange(c, a) > 0.5, 'a frame with fresh noise and a moved ball scored as a repeat')
  assert(frameChange(a, undefined) === Infinity, 'the first frame of a window must never be dropped')
})

check('a phone tilted up costs the launch angle a fraction of a degree', () => {
  // Worth measuring because it decides whether the launch angle is a real
  // quantity or a number about the tripod. Roll is corrected, and has to be:
  // `levelOutbound` below shows eight degrees of roll is eight degrees of launch
  // angle. Pitch is NOT corrected — `spatial.ts` does not measure it, and there
  // is no plumb line in the picture that would let it.
  //
  // It turns out not to matter, for a reason that is geometry rather than luck.
  // Pitch rotates the camera about an axis running along the ball's travel, so
  // it cannot turn the ball's direction in the image at all; all it does is
  // change the distance the perspective divides by, which scales the tangent of
  // the angle by a few percent. Roll rotates about the optical axis, which is
  // exactly the rotation that does turn it.
  const base = outboundDetections(struckBase)
  const angleOf = (m: ReturnType<typeof outboundDetections>) => {
    const track = trackOutbound(m.perFrame, {
      anchor: anchorFor(m.contact),
      aspect: ASPECT,
      bodyHeight: struckBase.bodyHeight,
    })
    assert(track !== undefined, 'lost the ball on a pitched camera')
    return readAt(track!).launchAngle_deg
  }
  const flat = angleOf(base)
  for (const pitchDeg of [5, 10, 15]) {
    const tilted = angleOf(outboundDetections({ ...struckBase, pitchDeg }))
    note(`${pitchDeg}° of camera pitch moved the launch angle ${(tilted - flat).toFixed(3)}°`)
    assert(
      Math.abs(tilted - flat) < 0.5,
      `${pitchDeg}° of pitch moved the launch angle ${(tilted - flat).toFixed(2)}° — if this ever approaches the pitch itself, the angle needs correcting the way roll does`,
    )
  }
})

check('levelling rotates the launch angle and leaves the speed alone', () => {
  const m = outboundDetections(struckBase)
  const track = trackOutbound(m.perFrame, {
    anchor: anchorFor(m.contact),
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })!
  const angleOf = (t: OutboundTrack) => readAt(t).launchAngle_deg
  const speedOf = (t: OutboundTrack) => readAt(t).speed

  const rolled = levelOutbound(track, 8, ASPECT)
  note(`8° of roll moved the launch angle ${(angleOf(rolled) - angleOf(track)).toFixed(2)}°`)
  // A phone cocked eight degrees is eight degrees of launch angle, in a quantity
  // whose entire interesting range is about ten. The speed is a rotation
  // invariant and must not move at all.
  near(angleOf(rolled) - angleOf(track), 8, 0.2, 'launch angle shift under an 8° roll')
  near(speedOf(rolled), speedOf(track), 1e-9, 'speed under a rotation')
  near(angleOf(levelOutbound(track, 0, ASPECT)), angleOf(track), 1e-9, 'launch angle under no roll')

  /*
   * And the reason the roll is now removed at any size.
   *
   * `analyze` only rotates the pose frames past `NOTABLE_ROLL` = 4°, because
   * re-detecting the keyframes below that is not worth the pass. The launch
   * angle used to inherit that threshold, so a clip rolled 3.9° kept 3.9° of
   * pure systematic in a quantity whose true value here is -5°. The mapping is
   * one for one and linear, which is what the assertion above establishes, so
   * this is not a hedge that could be priced — it is the reading being wrong by
   * most of itself. Both signs, because the error is signed and a test that
   * only ever rolled one way would miss a sign flip in the correction.
   */
  for (const roll of [-3.9, -1.5, 1.5, 3.9]) {
    const uncorrected = angleOf(levelOutbound(track, roll, ASPECT))
    const corrected = angleOf(levelOutbound(levelOutbound(track, roll, ASPECT), -roll, ASPECT))
    note(
      `  ${roll}° of roll, all of it under NOTABLE_ROLL: uncorrected ${uncorrected.toFixed(2)}°, ` +
        `corrected ${corrected.toFixed(2)}°`,
    )
    near(corrected, angleOf(track), 1e-9, `launch angle after removing a ${roll}° roll`)
    assert(
      Math.abs(uncorrected - angleOf(track) - roll) < 0.2,
      `a ${roll}° roll left ${(uncorrected - angleOf(track)).toFixed(2)}° in the angle — ` +
        'if this is ever small, the sub-threshold correction has stopped being load-bearing',
    )
  }
})

check('the launch angle is read against the camera angle, not against image x', () => {
  /*
   * What the second copy of this formula could never have caught.
   *
   * The shipped reading divides the horizontal by the depth gain at the measured
   * yaw before taking the arctangent, so the same ball reads a different angle
   * from a corner camera than from a side-on one — flatter, because more of its
   * travel is hidden in the lens. That is correct, and it is also the whole
   * reason `launchAngleConfidence` multiplies by `horizontal.confidence` at all.
   * A test computing `atan2(-vy, |vx * aspect|)` agrees with it at 90° and
   * nowhere else, which is why every figure in this section was taken at 90°
   * without anyone choosing to.
   */
  const m = outboundDetections(struckBase)
  const track = trackOutbound(m.perFrame, {
    anchor: anchorFor(m.contact),
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })!

  const sideOn = readAt(track)
  const corner = readAt(track, imageXSplit(45))
  note(
    `  side-on ${sideOn.launchAngle_deg.toFixed(2)}° at ${sideOn.speed.toFixed(2)} bh/s · ` +
      `45° corner ${corner.launchAngle_deg.toFixed(2)}° at ${corner.speed.toFixed(2)} bh/s`,
  )
  // sin(45°) = 0.707, so the horizontal is recovered 1.41x longer and the angle
  // flattens by that ratio in x. Stated as a ratio of tangents, which is what
  // the arithmetic actually is.
  near(
    Math.tan((sideOn.launchAngle_deg * Math.PI) / 180) /
      Math.tan((corner.launchAngle_deg * Math.PI) / 180),
    Math.SQRT2,
    0.01,
    'ratio of tangents between a side-on and a 45° reading',
  )

  // And the refusal, which is the one thing this function does that no caller
  // can undo. Below 18° the depth gain is 0.309 and falling.
  assert(
    readOutboundFlight(track, imageXSplit(17), ASPECT, struckBase.bodyHeight) === undefined,
    'a camera too near face-on still produced a serve speed',
  )
  assert(
    readOutboundFlight(track, imageXSplit(18), ASPECT, struckBase.bodyHeight) !== undefined,
    'the bottom of DEPTH_YAW_RANGE was refused, and spatial.ts says it is accepted',
  )
})

heading('A ball briefly occluded mid-flight, not just absent throughout')

/**
 * `trackOutbound`'s own design already answers this without a line of new
 * code: it seeds a velocity from every candidate in the pool in turn and
 * keeps whichever seed the most other candidates agree with, so nothing in
 * it assumes the surviving detections are contiguous — a robust fit over
 * whichever frames happen to have seen the ball, not a running sum that
 * would notice a hole.
 *
 * The existing "too few frames produces nothing rather than a slope" check
 * above already asks a related but different question: a camera that ran
 * uniformly slower throughout. This asks the one the racket follow-through
 * or the server's own body actually produces — a real detection on either
 * side of a gap, not a thinner clip end to end. Read, not assumed: `struckBase`
 * still renders real bitmaps through the real blob detector, and the frames
 * dropped below are real detections removed after the fact, not a fixture
 * built to already be gap-shaped.
 */
check('a contiguous mid-flight occlusion costs nothing a same-sized uniform reduction would not', () => {
  const m = outboundDetections(struckBase)
  const opts = { anchor: anchorFor(m.contact), aspect: ASPECT, bodyHeight: struckBase.bodyHeight }
  const clean = trackOutbound(m.perFrame, opts)
  assert(clean !== undefined, 'the rig could not even fit its own clean clip')

  // Three frames out of the middle -- the racket follow-through or the
  // server's own body crossing in front of the ball for an instant.
  const mid = Math.floor(m.perFrame.length / 2)
  const occluded = m.perFrame.filter((_, i) => !(i >= mid - 1 && i <= mid + 1))
  const occludedTrack = trackOutbound(occluded, opts)
  assert(
    occludedTrack !== undefined,
    `a 3-frame mid-flight gap alone lost the fit (${m.perFrame.length} down to ${occluded.length} frames)`,
  )
  assert(occluded.length < m.perFrame.length, 'dropping frames did not actually remove any detections')

  // Compared against the same clip read clean, not against a truth value —
  // the point under test is that the gap costs nothing beyond what fewer
  // samples always costs, which the clean fit is the honest baseline for.
  const cleanRead = readAt(clean!)
  const occludedRead = readAt(occludedTrack!)
  note(
    `clean: ${cleanRead.speed.toFixed(2)} body heights/s, conf ${clean!.fitConfidence.toFixed(2)} ` +
      `(${clean!.samples.length} samples); occluded: ${occludedRead.speed.toFixed(2)}, ` +
      `conf ${occludedTrack!.fitConfidence.toFixed(2)} (${occludedTrack!.samples.length} samples)`,
  )
  within(
    Math.abs(occludedRead.speed / cleanRead.speed - 1),
    0,
    0.05,
    'speed drift from a mid-flight occlusion, against the same clip read clean',
  )
})

check('occlusion severe enough to strand exactly the sample floor still fits, split across the gap', () => {
  const m = outboundDetections(struckBase)
  // Keep only the first two and the last few detections, whatever clears
  // OUTBOUND_MIN_SAMPLES -- an occlusion spanning most of the window, split
  // across its two edges rather than one contiguous chunk in the middle.
  const edges = m.perFrame.filter((_, i) => i < 2 || i >= m.perFrame.length - 3)
  const track = trackOutbound(edges, {
    anchor: anchorFor(m.contact),
    aspect: ASPECT,
    bodyHeight: struckBase.bodyHeight,
  })
  note(`${edges.length} of ${m.perFrame.length} frames survive, split across a wide middle gap`)
  assert(
    track !== undefined,
    `a severe split occlusion (${edges.length} of ${m.perFrame.length} frames, both ends) lost the fit entirely`,
  )
})

report()
