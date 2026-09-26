import { describe, expect, it } from 'vitest'
import type { BallObservation, BallTrack } from '../types.ts'
import { median, percentile } from './fit.ts'
import { scaleFromBodyHeight, type PixelScale } from './scale.ts'
import { makeTossScenario, type TossScenario } from './testing/scenarios.ts'
import { project } from './testing/synthTrajectories.ts'
import { analyseToss, gravityAccelerationPrior, gravityTimeScaleCheck, toEventEstimate } from './toss.ts'
import { trackBall } from './tracker.ts'

const rms = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length)
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length

/** Scale as the pipeline would build it: stature in frame from pose (3% error budget) + a height. */
function scaleFor(s: TossScenario, heightM: number | null): PixelScale {
  return scaleFromBodyHeight(s.statureM * s.unitsPerM, 0.03, heightM)
}

function analyse(s: TossScenario, heightM: number | null) {
  const tracked = trackBall(s.frames, { aspect: s.aspect, expectedRadiusNorm: s.radiusNorm, maxTossDurationS: 3 / s.timeScale })
  if (!tracked.toss) return null
  return analyseToss(tracked.toss.track, tracked.toss.leadIn, { aspect: s.aspect, scale: scaleFor(s, heightM) })
}

describe('analyseToss accuracy on synthetic tosses (side view, detection noise 0.3 ball radii, 10% misses, ~1 false candidate/frame)', () => {
  for (const fps of [30, 60, 120, 240]) {
    it(`apex and release timing at ${fps} fps`, { timeout: 60_000 }, () => {
      const apexErr: number[] = []
      const apexZ: number[] = []
      const releaseErr: number[] = []
      const releaseZ: number[] = []
      const riseErr: number[] = []
      const factors: number[] = []
      let unavailable = 0
      const trials = 30
      for (let seed = 1; seed <= trials; seed++) {
        const s = makeTossScenario({ fps, seed: 1000 + seed })
        const a = analyse(s, 1.8)
        if (!a || a.status !== 'ok') {
          unavailable++
          continue
        }
        apexErr.push(a.apex!.tReal - s.truth.apexTime)
        apexZ.push((a.apex!.tReal - s.truth.apexTime) / a.apex!.uncertaintyS)
        releaseErr.push(a.release!.tReal - s.params.releaseTime)
        releaseZ.push((a.release!.tReal - s.params.releaseTime) / a.release!.uncertaintyS)
        const releaseY = project(s.camera, s.truth.positionAt(s.params.releaseTime)).y
        const apexY = project(s.camera, s.truth.apexPos).y
        riseErr.push(a.heights!.riseAboveReleaseNorm / (releaseY - apexY) - 1)
        if (a.gravity.status === 'ok') factors.push(a.gravity.timeScaleFactor!)
      }
      const periodMs = 1000 / fps
      console.info(
        `[ball-accuracy] toss ${fps} fps (${trials - unavailable}/${trials} analysed): apex time error rms ${(rms(apexErr) * 1000).toFixed(2)} ms ` +
          `(bias ${(mean(apexErr) * 1000).toFixed(2)} ms, ${(rms(apexErr) * 1000 / periodMs).toFixed(3)} frames; |z| median ${median(apexZ.map(Math.abs)).toFixed(2)}); ` +
          `release error rms ${(rms(releaseErr) * 1000).toFixed(1)} ms (bias ${(mean(releaseErr) * 1000).toFixed(1)} ms, |err| p90 ${(percentile(releaseErr.map(Math.abs), 90) * 1000).toFixed(1)} ms, |z| median ${median(releaseZ.map(Math.abs)).toFixed(2)}, within 2 sigma ${releaseZ.filter((v) => Math.abs(v) <= 2).length}/${releaseZ.length}); ` +
          `rise above release error rms ${(100 * rms(riseErr)).toFixed(1)}%; gravity time-scale factor mean ${mean(factors).toFixed(4)} sd ${Math.sqrt(mean(factors.map((f) => (f - mean(factors)) ** 2))).toFixed(4)}`,
      )
      expect(unavailable).toBeLessThanOrEqual(1)
      expect(rms(apexErr)).toBeLessThan(Math.max(0.0025, 0.1 / fps))
      expect(median(releaseErr.map(Math.abs))).toBeLessThan(0.03)
      expect(rms(releaseErr)).toBeLessThan(0.05)
      expect(rms(riseErr)).toBeLessThan(0.1)
      expect(Math.abs(mean(factors) - 1)).toBeLessThan(0.03)
      // Reported uncertainties are honest: most errors fall within 2 sigma.
      expect(median(apexZ.map(Math.abs))).toBeLessThan(1.5)
      expect(releaseZ.filter((v) => Math.abs(v) <= 2).length).toBeGreaterThanOrEqual(0.85 * releaseZ.length)
    })
  }
})

describe('gravity time-scale check', () => {
  it('recovers timeScale 1 for real-time timestamps', { timeout: 60_000 }, () => {
    const factors: number[] = []
    let plausible = 0
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeTossScenario({ fps: 60, seed: 200 + seed })
      const a = analyse(s, 1.8)!
      factors.push(a.gravity.timeScaleFactor!)
      if (a.gravity.plausible && a.gravity.nearestStandard?.factor === 1) plausible++
      expect(a.gravity.low! <= 1 && a.gravity.high! >= 1).toBe(true)
    }
    console.info(`[ball-accuracy] gravity check real time (60 fps, entered height): factor mean ${mean(factors).toFixed(4)}, max |error| ${Math.max(...factors.map((f) => Math.abs(f - 1))).toFixed(4)}`)
    expect(plausible).toBe(20)
  })

  it('recovers timeScale 0.125 for 240 fps footage timestamped as 30 fps', { timeout: 60_000 }, () => {
    const factors: number[] = []
    for (let seed = 1; seed <= 10; seed++) {
      const s = makeTossScenario({ fps: 240, seed: 300 + seed, timeScale: 0.125 })
      const a = analyse(s, 1.8)!
      expect(a.status).toBe('ok')
      const g = a.gravity
      factors.push(g.timeScaleFactor!)
      expect(g.plausible).toBe(false)
      expect(g.nearestStandard).toMatchObject({ factor: 0.125, consistent: true })
      expect(g.captureFpsFactor! * 30).toBeGreaterThan(220)
      expect(g.captureFpsFactor! * 30).toBeLessThan(260)
      // Apex timing in the media time base is still accurate (2 ms of real time).
      expect(Math.abs(a.apex!.tReal * s.timeScale - s.truth.apexTime)).toBeLessThan(0.002)
    }
    console.info(
      `[ball-accuracy] gravity check 240 fps as 30 fps: factor mean ${mean(factors).toFixed(4)} (true 0.125), max |rel error| ${(100 * Math.max(...factors.map((f) => Math.abs(f / 0.125 - 1)))).toFixed(1)}%`,
    )
  })

  it('with an assumed (not entered) height the factor carries the height error and a wider interval', () => {
    const s = makeTossScenario({ fps: 60, seed: 42, statureM: 1.95 })
    const a = analyse(s, null)!
    const g = a.gravity
    // True stature 1.95 m, assumed 1.75 m: scale overestimated by 11%, factor ~ 1/sqrt(1.11) = 0.95.
    expect(g.timeScaleFactor!).toBeGreaterThan(0.9)
    expect(g.timeScaleFactor!).toBeLessThan(0.99)
    expect(g.plausible).toBe(true)
    expect(g.high! - g.low!).toBeGreaterThan(0.08)
  })

  it('refuses without a scale or with a hopeless acceleration estimate', () => {
    expect(gravityTimeScaleCheck({ accelerationNorm: 2, accelerationSigmaNorm: 0.1, scale: { unitsPerM: 0, relSigma: 0.05, basis: '' } }).status).toBe('unavailable')
    expect(gravityTimeScaleCheck({ accelerationNorm: 2, accelerationSigmaNorm: 1, scale: { unitsPerM: 0.2, relSigma: 0.05, basis: '' } }).status).toBe('unavailable')
    expect(gravityTimeScaleCheck({ accelerationNorm: -2, accelerationSigmaNorm: 0.1, scale: { unitsPerM: 0.2, relSigma: 0.05, basis: '' } }).status).toBe('unavailable')
    const ok = gravityTimeScaleCheck({ accelerationNorm: 9.81 * 0.2, accelerationSigmaNorm: 0.02, scale: { unitsPerM: 0.2, relSigma: 0.03, basis: '' } })
    expect(ok.timeScaleFactor).toBeCloseTo(1, 6)
    expect(ok.apparentGravityMps2).toBeCloseTo(9.81, 6)
  })
})

describe('analyseToss refusals and outputs', () => {
  const observation = (i: number, y: number): BallObservation => ({ frameIndex: i, tReal: i / 30, x: 0.5, y, radius: 0.008, score: 0.8, source: 'detected' })

  it('refuses with too few detections', () => {
    const track: BallTrack = { id: 1, kind: 'toss', observations: [0, 1, 2, 3, 4].map((i) => observation(i, 0.5 - 0.02 * i + 0.002 * i * i)) }
    const a = analyseToss(track, [], { aspect: 9 / 16 })
    expect(a.status).toBe('unavailable')
    expect(a.reason).toMatch(/detections/)
    expect(a.gravity.status).toBe('unavailable')
  })

  it('refuses a path that is not a downward-accelerating free flight', () => {
    const track: BallTrack = { id: 1, kind: 'unknown', observations: Array.from({ length: 12 }, (_, i) => observation(i, 0.3 + 0.03 * i - 0.004 * i * i)) }
    expect(analyseToss(track, [], { aspect: 9 / 16 }).status).toBe('unavailable')
  })

  it('reports heights against references and converts events to the shared contract', () => {
    const s = makeTossScenario({ fps: 60, seed: 5 })
    const tracked = trackBall(s.frames, { aspect: s.aspect, expectedRadiusNorm: s.radiusNorm })
    const groundY = project(s.camera, { x: 0, y: 0, z: 0 }).y
    const bodyHeightNorm = s.statureM * s.unitsPerM
    const a = analyseToss(tracked.toss!.track, tracked.toss!.leadIn, {
      aspect: s.aspect,
      references: { groundY, bodyHeightNorm, headTopY: groundY - bodyHeightNorm },
    })
    expect(a.gravity.status).toBe('unavailable')
    const apexHeightM = a.heights!.apexOverBodyHeight! * s.statureM
    expect(Math.abs(apexHeightM - s.truth.apexPos.y)).toBeLessThan(0.05)
    expect(a.heights!.aboveHeadNorm! / bodyHeightNorm).toBeCloseTo((s.truth.apexPos.y - s.statureM) / s.statureM, 1)
    expect(a.apex!.bracketed).toBe(true)
    const event = toEventEstimate(a.apex!)
    expect(event.method).toBe('ball-apex-fit')
    expect(event.uncertaintyS).toBeGreaterThan(0)
  })
})

describe('toss whose apex leaves the top of the frame (tight framing: stature 60% of frame height)', () => {
  for (const fps of [30, 60, 120, 240]) {
    it(`links both sides and keeps honest apex uncertainty at ${fps} fps`, { timeout: 60_000 }, () => {
      const twoSidedErr: number[] = []
      const oneSidedErr: number[] = []
      const oneSidedPriorErr: number[] = []
      const z: number[] = []
      const zPrior: number[] = []
      let found = 0
      let aboveFrame = 0
      const trials = 20
      for (let seed = 1; seed <= trials; seed++) {
        const s = makeTossScenario({ fps, seed: 5000 + seed, statureFraction: 0.6, contactAfterApexS: [0.25, 0.35] })
        const tracked = trackBall(s.frames, { aspect: s.aspect, expectedRadiusNorm: s.radiusNorm })
        if (!tracked.toss || tracked.toss.track.kind !== 'toss') continue
        found++
        // No predicted observation may be placed outside the frame.
        for (const o of tracked.toss.track.observations) if (o.source === 'predicted') expect(o.y).toBeGreaterThan(0)
        const scale = scaleFor(s, 1.8)
        const a = analyseToss(tracked.toss.track, tracked.toss.leadIn, { aspect: s.aspect, scale })
        // Same track with gravity as a prior (time base known to be real time).
        const p = analyseToss(tracked.toss.track, tracked.toss.leadIn, { aspect: s.aspect, scale, accelerationPrior: gravityAccelerationPrior(scale) })
        if (a.status !== 'ok' || p.status !== 'ok') continue
        if (project(s.camera, s.truth.apexPos).y < 0) aboveFrame++
        const err = a.apex!.tReal - s.truth.apexTime
        const errPrior = p.apex!.tReal - s.truth.apexTime
        z.push(err / a.apex!.uncertaintyS)
        zPrior.push(errPrior / p.apex!.uncertaintyS)
        if (a.apex!.bracketed) {
          twoSidedErr.push(err)
          // The prior never touches a bracketed apex.
          expect(p.apex!.gravityPrior).toBe(false)
          expect(p.apex!.tReal).toBe(a.apex!.tReal)
        } else {
          oneSidedErr.push(err)
          oneSidedPriorErr.push(errPrior)
        }
      }
      const fmt = (v: number[]) => v.map((x) => Math.abs(x)).reduce((m, x) => Math.max(m, x), 0).toFixed(2)
      console.info(
        `[ball-accuracy] toss apex above frame ${fps} fps (${trials} clips, ${aboveFrame} with the apex out of frame): found ${found}, ` +
          `two-sided apex error rms ${(rms(twoSidedErr) * 1000).toFixed(2)} ms (n=${twoSidedErr.length}); ` +
          `one-sided (n=${oneSidedErr.length}) rms ${(rms(oneSidedErr) * 1000).toFixed(1)} ms data-only vs ${(rms(oneSidedPriorErr) * 1000).toFixed(1)} ms with gravity prior; ` +
          `|z| max ${fmt(z)} data-only, ${fmt(zPrior)} with prior`,
      )
      expect(found).toBeGreaterThanOrEqual(trials - 1)
      expect(aboveFrame).toBeGreaterThanOrEqual(trials / 2)
      expect(twoSidedErr.length).toBeGreaterThanOrEqual(trials / 2)
      expect(rms(twoSidedErr)).toBeLessThan(fps >= 60 ? 0.003 : 0.005)
      // Reported uncertainty must cover the error, also when the apex is extrapolated.
      expect(Math.max(...z.map(Math.abs))).toBeLessThan(4)
      expect(Math.max(...zPrior.map(Math.abs))).toBeLessThan(4)
      if (oneSidedErr.length >= 3) expect(rms(oneSidedPriorErr)).toBeLessThan(rms(oneSidedErr))
    })
  }
})
