import { describe, expect, it } from 'vitest'
import { BallDetector, chooseDownscaleFactor, downscaleRgb } from './detector.ts'
import { median, percentile } from './fit.ts'
import { ballAt, createScene, LIGHTING, type Capsule, type SceneSpec } from './testing/synthFrames.ts'

const W = 360
const H = 640
const G_PX = 9.81 * 160 // 160 px per metre at the player's depth

interface ScenarioResult {
  frames: number
  top1Recall: number
  anyRecall: number
  precision: number
  medianErrPx: number
  p95ErrPx: number
  falsePerFrame: number
}

/**
 * Renders a clip, runs the detector frame by frame and scores against ground truth. The first
 * frame is excluded (no background yet). A candidate matches if its centre is within
 * max(2 px, radius) of the true mid-exposure centre.
 */
function runScenario(
  spec: Omit<SceneSpec, 'width' | 'height' | 'seed'> & { seed?: number },
  options: {
    fps: number
    frames: number
    radiusPx: number
    exposureS: number
    path: (t: number) => { x: number; y: number }
    dynamic?: (t: number) => Capsule[]
    t0?: number
  },
): ScenarioResult {
  const scene = createScene({ width: W, height: H, seed: 11, ...spec })
  const detector = new BallDetector({ expectedRadiusNorm: options.radiusPx / H })
  let top1 = 0
  let any = 0
  let candidates = 0
  let matched = 0
  const errors: number[] = []
  for (let f = 0; f < options.frames; f++) {
    const t = (options.t0 ?? 0) + f / options.fps
    const ball = ballAt(options.path, t, options.exposureS, options.radiusPx)
    const image = scene.render(ball, options.dynamic?.(t) ?? [], 1000 + f)
    const found = detector.detect({ image, tReal: t })
    if (f === 0) continue
    const tol = Math.max(2, options.radiusPx)
    const dist = (c: { x: number; y: number }) => Math.hypot(c.x * W - ball.x, c.y * H - ball.y)
    const good = found.filter((c) => dist(c) < tol)
    candidates += found.length
    matched += good.length
    if (good.length) any++
    if (found[0] && dist(found[0]) < tol) {
      top1++
      errors.push(dist(found[0]))
    }
  }
  const n = options.frames - 1
  return {
    frames: n,
    top1Recall: top1 / n,
    anyRecall: any / n,
    precision: candidates ? matched / candidates : 1,
    medianErrPx: median(errors),
    p95ErrPx: percentile(errors, 95),
    falsePerFrame: (candidates - matched) / n,
  }
}

function report(name: string, r: ScenarioResult): void {
  console.info(
    `[ball-accuracy] detector ${name}: top1 recall ${r.top1Recall.toFixed(3)}, any recall ${r.anyRecall.toFixed(3)}, ` +
      `precision ${r.precision.toFixed(3)} (${r.falsePerFrame.toFixed(2)} false/frame), ` +
      `loc err median ${r.medianErrPx.toFixed(2)} px p95 ${r.p95ErrPx.toFixed(2)} px (n=${r.frames})`,
  )
}

// A toss seen side-on at 60 fps: rises from the hand at 5 m/s, apex after ~0.5 s.
const tossPath = (t: number) => ({ x: 170 + 40 * t, y: 380 - 5 * 160 * t + 0.5 * G_PX * t * t })
const toss60 = { fps: 60, frames: 60, radiusPx: 6, exposureS: 1 / 120, path: tossPath }

describe('BallDetector on synthetic toss clips', () => {
  const scenarios: [string, Omit<SceneSpec, 'width' | 'height' | 'seed'>][] = [
    ['grass + sky, sun', { upper: 'sky', lower: 'grass', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 4, playerX: 0.4 }],
    ['blue hard court + windscreen, sun', { upper: 'fence', lower: 'hardcourt', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 4, playerX: 0.4 }],
    ['blue hard court, shade', { upper: 'fence', lower: 'hardcourt', horizonY: 0.45, lighting: LIGHTING.shade, noiseSigma: 5, playerX: 0.4 }],
    ['clay + dusk sky, dusk', { upper: 'dusk-sky', lower: 'clay', horizonY: 0.45, lighting: LIGHTING.dusk, noiseSigma: 6, playerX: 0.4 }],
    ['grass + sky, cool white balance', { upper: 'sky', lower: 'grass', horizonY: 0.45, lighting: LIGHTING.coolWhiteBalance, noiseSigma: 4 }],
    ['hard court, warm white balance', { upper: 'fence', lower: 'hardcourt', horizonY: 0.45, lighting: LIGHTING.warmWhiteBalance, noiseSigma: 4 }],
  ]
  for (const [name, spec] of scenarios) {
    it(`finds the ball: ${name}`, { timeout: 30_000 }, () => {
      const r = runScenario(spec, toss60)
      report(name, r)
      expect(r.top1Recall).toBeGreaterThanOrEqual(0.95)
      expect(r.precision).toBeGreaterThanOrEqual(0.9)
      expect(r.medianErrPx).toBeLessThan(1)
    })
  }

  it('suppresses static and oversized yellow distractors and moving limbs', { timeout: 30_000 }, () => {
    const arm = (t: number): Capsule[] => [
      // Skin-coloured arm swinging and a yellow-green sleeve (3x ball size) moving with it.
      { ax: 150, ay: 330, bx: 150 + 60 * Math.cos(3 * t), by: 330 - 60 * Math.sin(3 * t), radius: 6, colour: [196, 146, 116] },
      { ax: 150, ay: 330, bx: 150 + 20 * Math.cos(3 * t), by: 330 - 20 * Math.sin(3 * t), radius: 12, colour: [170, 200, 60] },
      { ax: 240, ay: 400 - 80 * t, bx: 270, by: 380 - 80 * t, radius: 4, colour: [30, 30, 35] },
    ]
    const r = runScenario(
      { upper: 'fence', lower: 'hardcourt', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 4, distractors: true, playerX: 0.4 },
      { ...toss60, dynamic: arm },
    )
    report('distractors (static spare ball, banner, dry patches, moving sleeve)', r)
    expect(r.top1Recall).toBeGreaterThanOrEqual(0.9)
    // The moving yellow-green sleeve is a genuine hard case; the tracker has to reject it.
    expect(r.precision).toBeGreaterThanOrEqual(0.5)
  })

  it('finds a small ball (radius 3 px)', { timeout: 30_000 }, () => {
    const smallPath = (t: number) => ({ x: 170 + 20 * t, y: 380 - 2.5 * 160 * t + 0.25 * G_PX * t * t })
    const r = runScenario(
      { upper: 'sky', lower: 'grass', horizonY: 0.45, lighting: LIGHTING.overcast, noiseSigma: 4 },
      { ...toss60, radiusPx: 3, path: smallPath },
    )
    report('small ball r=3 px, overcast grass/sky', r)
    expect(r.top1Recall).toBeGreaterThanOrEqual(0.9)
    expect(r.medianErrPx).toBeLessThan(1)
  })

  it('keeps the ball while it hangs at the apex at 240 fps', { timeout: 30_000 }, () => {
    // 0.25 s centred on the apex: the ball moves < 1 radius between many consecutive frames.
    const apexT = (5 * 160) / G_PX
    const r = runScenario(
      { upper: 'sky', lower: 'grass', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 4 },
      { fps: 240, frames: 60, radiusPx: 6, exposureS: 1 / 480, path: tossPath, t0: apexT - 0.125 },
    )
    report('240 fps apex hover', r)
    expect(r.top1Recall).toBeGreaterThanOrEqual(0.95)
  })
})

describe('BallDetector on motion-blurred balls', () => {
  it('estimates streak length and direction', { timeout: 30_000 }, () => {
    const results: string[] = []
    const checks: (() => void)[] = []
    for (const streakDiameters of [0, 1, 2, 4, 6]) {
      const radiusPx = 6
      const speedPxS = (streakDiameters * 2 * radiusPx) / (1 / 240)
      const angle = -0.35
      const scene = createScene({ width: W, height: H, seed: 5, upper: 'fence', lower: 'hardcourt', horizonY: 0.3, lighting: LIGHTING.sun, noiseSigma: 4 })
      const detector = new BallDetector({ expectedRadiusNorm: radiusPx / H })
      const lengthErr: number[] = []
      const angleErr: number[] = []
      const posErr: number[] = []
      let hits = 0
      const frames = 12
      for (let f = 0; f < frames; f++) {
        const t = f / 240
        // A fresh position every frame, as for a fast ball, so frames do not overlap.
        const cx = 80 + 45 * (f % 5)
        const cy = 220 + 70 * Math.floor(f / 5)
        const path = (tt: number) => ({ x: cx + speedPxS * Math.cos(angle) * (tt - t), y: cy + speedPxS * Math.sin(angle) * (tt - t) })
        const ball = ballAt(path, t, 1 / 240, radiusPx)
        const found = detector.detect({ image: scene.render(ball, [], 50 + f), tReal: t })
        if (f === 0) continue
        const hit = found.find((c) => Math.hypot(c.x * W - ball.x, c.y * H - ball.y) < radiusPx + (streakDiameters * radiusPx) / 2)
        if (!hit) continue
        hits++
        posErr.push(Math.hypot(hit.x * W - ball.x, hit.y * H - ball.y))
        lengthErr.push(hit.streakLengthNorm * H - streakDiameters * 2 * radiusPx)
        if (streakDiameters >= 2) {
          let d = hit.streakAngleRad - angle
          d = Math.atan2(Math.sin(2 * d), Math.cos(2 * d)) / 2
          angleErr.push(Math.abs(d))
        }
      }
      const recall = hits / (frames - 1)
      results.push(
        `streak ${streakDiameters} diameters: recall ${recall.toFixed(2)}, centre err median ${median(posErr).toFixed(2)} px, ` +
          `length err median ${median(lengthErr).toFixed(1)} px, angle err median ${angleErr.length ? ((median(angleErr) * 180) / Math.PI).toFixed(1) : 'n/a'} deg`,
      )
      checks.push(() => {
        if (streakDiameters <= 2) expect(recall).toBeGreaterThanOrEqual(0.9)
        if (streakDiameters >= 2 && angleErr.length) expect(median(angleErr)).toBeLessThan(0.15)
        if (streakDiameters >= 2 && lengthErr.length) expect(Math.abs(median(lengthErr))).toBeLessThan(0.35 * streakDiameters * 2 * radiusPx)
      })
    }
    for (const line of results) console.info(`[ball-accuracy] detector blur ${line}`)
    for (const check of checks) check()
  })
})

describe('BallDetector behaviour', () => {
  it('limits detection to the region of interest', () => {
    const scene = createScene({ width: W, height: H, seed: 3, upper: 'sky', lower: 'grass', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 3 })
    const detector = new BallDetector({ expectedRadiusNorm: 6 / H, roi: { x0: 0.6, y0: 0, x1: 1, y1: 1 } })
    for (let f = 0; f < 4; f++) {
      const ball = ballAt(() => ({ x: 100, y: 200 + 10 * f }), 0, 0, 6)
      const found = detector.detect({ image: scene.render(ball, [], f), tReal: f / 30 })
      expect(found).toHaveLength(0)
    }
  })

  it('does not report a stationary ball once motion is available', () => {
    const scene = createScene({ width: W, height: H, seed: 4, upper: 'fence', lower: 'hardcourt', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 3 })
    const detector = new BallDetector({ expectedRadiusNorm: 6 / H })
    const ball = ballAt(() => ({ x: 180, y: 500 }), 0, 0, 6)
    const first = detector.detect({ image: scene.render(ball, [], 1), tReal: 0 })
    // First frame: colour and shape only, reported with an unknown motion score.
    expect(first[0]?.motionScore).toBeNull()
    let last = first
    for (let f = 1; f < 10; f++) last = detector.detect({ image: scene.render(ball, [], 1 + f), tReal: f / 30 })
    const best = last[0]?.score ?? 0
    expect(best).toBeLessThan(first[0].score * 0.5)
  })

  it('downscale factor targets ~3 cells per expected radius', () => {
    expect(chooseDownscaleFactor(1080, 16 / 1080)).toBe(5)
    expect(chooseDownscaleFactor(640, 6 / 640)).toBe(2)
    expect(chooseDownscaleFactor(640, 3 / 640)).toBe(1)
    expect(chooseDownscaleFactor(1440)).toBe(2)
    // Faster, coarser grid on request: 2 cells per radius.
    expect(chooseDownscaleFactor(960, 4.8 / 960, 2)).toBe(2)
    const image = { width: 4, height: 2, data: new Uint8ClampedArray(4 * 2 * 4).map((_, i) => (i % 4 === 0 ? (i / 4) * 10 : 255)) }
    const grid = downscaleRgb(image, 2)
    expect(grid.width).toBe(2)
    expect(grid.height).toBe(1)
    expect(grid.r[0]).toBeCloseTo((0 + 10 + 40 + 50) / 4)
  })
})
