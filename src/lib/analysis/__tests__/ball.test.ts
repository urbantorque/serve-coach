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
  trackBall,
  type Bitmap,
} from '../../vision/ballTrack'
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

report()
