/**
 * End to end on rendered frames: synthetic side-view toss -> BallDetector -> trackBall ->
 * analyseToss, scored against the simulated ground truth.
 */
import { describe, expect, it } from 'vitest'
import type { ImageDataLike } from '../types.ts'
import { BallDetector } from './detector.ts'
import { createRng, gaussian } from './random.ts'
import { BALL_RADIUS_M, scaleFromBodyHeight } from './scale.ts'
import { ballAt, createScene, LIGHTING, type Capsule } from './testing/synthFrames.ts'
import { defaultTossParams, frameTimes, project, sideViewCamera, simulateToss } from './testing/synthTrajectories.ts'
import { analyseToss } from './toss.ts'
import { trackBall, type FrameCandidates } from './tracker.ts'

const W = 360
const H = 640
const ASPECT = W / H
const STATURE_M = 1.8

interface ClipOptions {
  /** 1-sigma camera shake (whole pixels per frame, random translation); 0 = tripod. */
  shakePx?: number
  /** Blue hard court + windscreen with yellow distractors (spare ball, banner, dry patches). */
  distractors?: boolean
}

const PAD = 12

/** Crop a padded render at an offset (camera shake as a per-frame translation). */
function crop(image: ImageDataLike, ox: number, oy: number): ImageDataLike {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    const src = ((y + oy) * image.width + ox) * 4
    data.set(image.data.subarray(src, src + W * 4), y * W * 4)
  }
  return { width: W, height: H, data }
}

function runClip(fps: number, seed: number, options: ClipOptions = {}) {
  const rng = createRng(seed)
  const shakeRng = createRng(100 + seed)
  const shakePx = options.shakePx ?? 0
  const pad = shakePx > 0 ? PAD : 0
  const camera = sideViewCamera(ASPECT, 6, 0.4, STATURE_M)
  const unitsPerM = camera.focalFhu / 6
  const radiusPx = BALL_RADIUS_M * unitsPerM * H
  const base = defaultTossParams({ releaseVel: { x: 0.2 + 0.3 * rng(), y: 4.4 + 0.8 * rng(), z: 0 } })
  const params = { ...base, contactTime: simulateToss(base).apexTime + 0.25 }
  const truth = simulateToss(params)
  const floor = project(camera, { x: 0, y: 0, z: 0 })
  const scene = createScene({
    width: W + 2 * pad,
    height: H + 2 * pad,
    upper: options.distractors ? 'fence' : 'sky',
    lower: options.distractors ? 'hardcourt' : 'grass',
    horizonY: floor.y - 0.12,
    lighting: LIGHTING.sun,
    noiseSigma: 4,
    seed,
    playerX: floor.x,
    distractors: options.distractors,
  })
  const detector = new BallDetector({ expectedRadiusNorm: radiusPx / H })
  const exposureS = 1 / (2 * fps)
  const frames: FrameCandidates[] = []
  const times = frameTimes(fps, params.releaseTime - 0.6, params.contactTime, rng())
  times.forEach((t, index) => {
    const shake = () => Math.max(-pad, Math.min(pad, Math.round(shakePx * gaussian(shakeRng))))
    const dx = shakePx > 0 ? shake() : 0
    const dy = shakePx > 0 ? shake() : 0
    // Scene content moves with the camera: draw at the frame position plus the shake.
    const toPx = (p: { x: number; y: number; z: number }) => {
      const q = project(camera, p)
      return { x: q.x * W + pad + dx, y: q.y * H + pad + dy }
    }
    const shoulder = toPx({ x: 0.05, y: 1.45, z: 0 })
    const ball = ballAt((tt) => toPx(truth.positionAt(tt)), t, exposureS, radiusPx)
    // Fingers hide the lower part of the ball until release.
    if (t < params.releaseTime) ball.occludedBelowFraction = 0.3
    // The tossing arm follows the ball up to release, then stops at the release point.
    const hand = toPx(truth.positionAt(Math.min(t, params.releaseTime)))
    const arm: Capsule[] = [{ ax: shoulder.x, ay: shoulder.y, bx: hand.x, by: hand.y + radiusPx * 1.2, radius: radiusPx * 0.9, colour: [196, 146, 116] }]
    const rendered = scene.render(ball, arm, seed * 10000 + index)
    const image = pad > 0 ? crop(rendered, pad + dx, pad + dy) : rendered
    frames.push({ frameIndex: index, tReal: t, candidates: detector.detect({ image, tReal: t }) })
  })
  return { frames, truth, params, unitsPerM, radiusNorm: radiusPx / H }
}

describe('ball pipeline on rendered frames (side view, grass + sky, sun)', () => {
  for (const fps of [60, 240]) {
    it(`toss apex / release / gravity at ${fps} fps`, { timeout: 120_000 }, () => {
      const apexErr: number[] = []
      const releaseErr: number[] = []
      const factors: number[] = []
      const slowFactors: number[] = []
      const clips = fps === 240 ? 2 : 4
      for (let seed = 1; seed <= clips; seed++) {
        const clip = runClip(fps, 50 + seed)
        const scale = scaleFromBodyHeight(STATURE_M * clip.unitsPerM, 0.03, STATURE_M)
        const tracked = trackBall(clip.frames, { aspect: ASPECT, expectedRadiusNorm: clip.radiusNorm })
        expect(tracked.toss?.track.kind).toBe('toss')
        const a = analyseToss(tracked.toss!.track, tracked.toss!.leadIn, { aspect: ASPECT, scale })
        expect(a.status).toBe('ok')
        apexErr.push(a.apex!.tReal - clip.truth.apexTime)
        releaseErr.push(a.release!.tReal - clip.params.releaseTime)
        factors.push(a.gravity.timeScaleFactor!)
        if (fps === 240) {
          // Same detections, but timestamped as 8x slow motion played at 30 fps.
          const media = clip.frames.map((f) => ({ ...f, tReal: f.tReal * 8 }))
          const slow = trackBall(media, { aspect: ASPECT, expectedRadiusNorm: clip.radiusNorm, maxTossDurationS: 24 })
          const s = analyseToss(slow.toss!.track, slow.toss!.leadIn, { aspect: ASPECT, scale })
          slowFactors.push(s.gravity.timeScaleFactor!)
          expect(s.gravity.nearestStandard?.factor).toBe(0.125)
        }
      }
      const fmt = (v: number[]) => v.map((x) => (x * 1000).toFixed(1)).join(', ')
      console.info(
        `[ball-accuracy] pipeline rendered ${fps} fps (${clips} clips): apex errors [${fmt(apexErr)}] ms, release errors [${fmt(releaseErr)}] ms, ` +
          `gravity factors [${factors.map((f) => f.toFixed(3)).join(', ')}]` +
          (slowFactors.length ? `, as 8x slow-mo [${slowFactors.map((f) => f.toFixed(4)).join(', ')}]` : ''),
      )
      for (const e of apexErr) expect(Math.abs(e)).toBeLessThan(0.004)
      for (const e of releaseErr) expect(Math.abs(e)).toBeLessThan(0.06)
      for (const f of factors) expect(Math.abs(f - 1)).toBeLessThan(0.05)
      for (const f of slowFactors) expect(Math.abs(f / 0.125 - 1)).toBeLessThan(0.05)
    })
  }
})

describe('ball pipeline on rendered frames with yellow distractors and camera shake', () => {
  it('toss apex and gravity at 60 fps with 2 px shake (blue hard court, spare ball, banner)', { timeout: 120_000 }, () => {
    const apexErr: number[] = []
    const factors: number[] = []
    const candidatesPerFrame: number[] = []
    for (let seed = 1; seed <= 3; seed++) {
      const clip = runClip(60, 70 + seed, { shakePx: 2, distractors: true })
      candidatesPerFrame.push(clip.frames.reduce((s, f) => s + f.candidates.length, 0) / clip.frames.length)
      const scale = scaleFromBodyHeight(STATURE_M * clip.unitsPerM, 0.03, STATURE_M)
      const tracked = trackBall(clip.frames, { aspect: ASPECT, expectedRadiusNorm: clip.radiusNorm })
      expect(tracked.toss?.track.kind).toBe('toss')
      const a = analyseToss(tracked.toss!.track, tracked.toss!.leadIn, { aspect: ASPECT, scale })
      expect(a.status).toBe('ok')
      apexErr.push(a.apex!.tReal - clip.truth.apexTime)
      factors.push(a.gravity.timeScaleFactor!)
    }
    console.info(
      `[ball-accuracy] pipeline rendered 60 fps, distractors + 2 px shake (3 clips): candidates/frame [${candidatesPerFrame.map((c) => c.toFixed(2)).join(', ')}], ` +
        `apex errors [${apexErr.map((e) => (e * 1000).toFixed(2)).join(', ')}] ms, gravity factors [${factors.map((f) => f.toFixed(3)).join(', ')}]`,
    )
    for (const e of apexErr) expect(Math.abs(e)).toBeLessThan(0.004)
    for (const f of factors) expect(Math.abs(f - 1)).toBeLessThan(0.05)
  })
})
